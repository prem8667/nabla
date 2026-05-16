"""Nabla API — V1.2.

Endpoints:
  GET  /health
  GET  /llm-status     whether the LLM is configured and reachable
  POST /transform      apply a SymPy op directly (used by chips and fallback)
  POST /suggest        propose plausible next ops for an expression
  POST /chat-turn      LLM-driven: user message in, transform or clarification out

SymPy is the oracle — every transformation, whether typed, chip-clicked, or
LLM-proposed, is computed and validated by SymPy. The LLM only chooses the move
and explains it.

LLM provider: OpenAI (GPT-5 Mini by default). The chat completions API and
"function" tool format. Note that GPT-5 family models burn reasoning tokens
against max_completion_tokens, so the budget here is generous.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Literal

import sympy
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import (
    APIError as OpenAIAPIError,
    APIStatusError as OpenAIAPIStatusError,
    OpenAI,
)
from pydantic import BaseModel, Field

load_dotenv()
logger = logging.getLogger("nabla")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Nabla API", version="1.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── LLM client ──────────────────────────────────────────────────────────────

OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-5-mini")
_openai_key = os.environ.get("OPENAI_API_KEY")
_openai_client: OpenAI | None = OpenAI(api_key=_openai_key) if _openai_key else None

SYSTEM_PROMPT = """You are Nabla, a math-derivation assistant. The user is a researcher working through a derivation on a three-pane workspace; the middle pane shows their currently active expression.

Your job: turn each user message into exactly ONE tool call.
- Use `apply_transform` whenever there is ANY reasonable interpretation of the user's input as a math operation. This is the default.
- Use `ask_clarification` only as a true last resort, when no reasonable starting expression exists.

PREFER ACTION OVER QUESTIONS:
- When the user names a TECHNIQUE, METHOD, THEOREM, or TOPIC (Fermat's tangent method, partial fractions, integration by parts, l'Hôpital's rule, Taylor series, chain rule, product rule, geometric series, etc.) without specifying an expression: commit to a CANONICAL EXAMPLE and apply the first natural step. Use the explanation field to say what canonical example you chose and what step you're applying. Examples:
    - "Fermat's tangent method" → diff on x**2 (canonical example for tangent slopes)
    - "integration by parts" → integrate on x*sin(x)
    - "l'Hôpital's rule" → limit of sin(x)/x as x→0
    - "Taylor series" → series on sin(x) at x0=0
    - "geometric series" → summation of x**n from n=0 to oo
    - "partial fractions" → integrate on 1/(x*(x-1)) or factor that denominator first
- When the user says "let's do a derivation" or "where do I start" without specifying: commit to a SMALL, ICONIC canonical problem (e.g. integrate x*sin(x), or diff x**2) and apply the first step. Use the explanation to invite the user to pick a different example if they want.
- Asking "which function would you like?" is almost always WORSE than picking one. The user can pivot in their next turn.

DISPLAYING A FORMULA (do not compute it):
- When the user wants to LOOK AT, DISCUSS, or UNDERSTAND a formula or equation rather than transform it — e.g. "let's talk about E = mc^2", "show me Newton's second law", "put the quadratic formula on the board", "what does the ideal gas law look like" — use op="show". It places the expression on the board UNCHANGED so the user can explore its parts and drill into the meaning of each symbol.
- Do NOT differentiate, integrate, or otherwise transform a formula the user just wants to see. "let's talk about E = mc^2" must become op="show", expr="Eq(E, m*c**2)" — never op="diff".
- Write equations with `Eq(lhs, rhs)`: `E = mc^2` → `Eq(E, m*c**2)`; `F = ma` → `Eq(F, m*a)`.

Hard rules:
- ALWAYS emit exactly one tool call. Never produce a plain text answer. Never write math in prose. SymPy will do the computation.
- Use SymPy syntax in `expr`: `x**2` (not x^2), `x*sin(x)`, `exp(x)`, `log(x)`, `pi`, `sqrt(x)`, `oo` for infinity. Equations use `Eq(lhs, rhs)`.
- When the user means "apply this to what is on the board" (e.g. "simplify that", "now differentiate it", "factor the result"), OMIT `expr`. The backend will use the active step's output.
- When the user introduces a fresh expression, PROVIDE `expr`.
- `var` is optional. Provide it only when the user names a variable, or when more than one symbol is present and the choice would otherwise be ambiguous.
- `explanation` is one or two short sentences a researcher would find useful — say *why* this move makes sense for the current state, not how to do it. When you committed to a canonical example, say so briefly.

Supported ops:
- show (no args; display the expression unchanged — for formulas the user wants to see/discuss)
- integrate (var; e.g. var='x')
- diff (var)
- simplify
- factor
- expand
- solve (var; treats expr as `expr = 0`)
- limit (var; args.point = where var approaches, e.g. 0 or 'oo'; args.direction = '+'/'-'/'+-')
- series (var; args.x0 = expansion point default 0; args.n = truncation order default 6)
- summation (var; args.from = lower bound default 0; args.to = upper bound default 'oo')
- trigsimp (no extra args; simplifies trig identities specifically)
- apart (var; partial-fractions decomposition of a rational function)
- dsolve (args.func default 'f', args.var default 'x'; expr should be the ODE's LHS using e.g. `Derivative(f(x), x) - f(x)` set to zero)

If the user's request maps to multiple ops in sequence (e.g. "find the integral and then simplify it"), pick the FIRST step only. The user can chain further with another turn or a chip click.
"""

# OpenAI tool format
TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "apply_transform",
            "description": "Apply a single symbolic math operation. SymPy will execute it.",
            "parameters": {
                "type": "object",
                "properties": {
                    "op": {
                        "type": "string",
                        "enum": [
                            "show",
                            "integrate",
                            "diff",
                            "simplify",
                            "factor",
                            "expand",
                            "solve",
                            "limit",
                            "series",
                            "summation",
                            "trigsimp",
                            "apart",
                            "dsolve",
                        ],
                        "description": (
                            "Which operation to apply. "
                            "integrate/diff: needs var. "
                            "solve: needs var; treats expr as `expr = 0`. "
                            "limit: takes expr → as var approaches a point. "
                            "series: Taylor/Maclaurin series expansion. "
                            "summation: sum of expr over var from lower to upper bound."
                        ),
                    },
                    "expr": {
                        "type": "string",
                        "description": "SymPy-parseable expression. OMIT this field when applying the op to the current active board state.",
                    },
                    "var": {
                        "type": "string",
                        "description": "Variable name (e.g. 'x'). Used by integrate, diff, solve, limit, series, summation. Optional when obvious from context.",
                    },
                    "args": {
                        "type": "object",
                        "description": (
                            "Op-specific arguments. Keys vary by op:\n"
                            "  - limit: {point: number/string-symbol (default 0), direction: '+'/'-'/'+-' (default '+-')}\n"
                            "  - series: {x0: number-or-symbol (default 0), n: integer truncation order (default 6)}\n"
                            "  - summation: {from: number (default 0), to: number or 'oo' (default 'oo')}\n"
                            "  - other ops: usually no args needed; var is at top level."
                        ),
                        "additionalProperties": True,
                    },
                    "explanation": {
                        "type": "string",
                        "description": "1-2 sentences explaining why this move makes sense for a researcher.",
                    },
                },
                "required": ["op", "explanation"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ask_clarification",
            "description": "Ask the user a clarifying question when their input genuinely cannot be turned into a transform.",
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "A specific question that, once answered, would let you pick a transform.",
                    },
                },
                "required": ["question"],
            },
        },
    },
]


# ─── Request / response models ───────────────────────────────────────────────


class TransformRequest(BaseModel):
    expr: str
    op: str
    args: dict[str, Any] = Field(default_factory=dict)


class TransformResult(BaseModel):
    input_latex: str
    output_latex: str
    output_sympy: str
    op: str


class SuggestRequest(BaseModel):
    expr: str


class Suggestion(BaseModel):
    op: str
    label: str
    args: dict[str, Any] = Field(default_factory=dict)


class SuggestResponse(BaseModel):
    suggestions: list[Suggestion]


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatTurnRequest(BaseModel):
    history: list[ChatMessage]
    active_expr: str | None = None
    active_op: str | None = None


class ChatTurnResponse(BaseModel):
    kind: Literal["transform", "clarification", "error"]
    message: str
    transform: TransformResult | None = None
    expr_used: str | None = None
    op_used: str | None = None
    var_used: str | None = None


class LlmStatus(BaseModel):
    configured: bool
    model: str | None


class DecomposeRequest(BaseModel):
    expr: str


class ExprPart(BaseModel):
    kind: str  # term | factor | base | exponent | argument | atom
    label: str  # human label, e.g. "term 2 of 3"
    latex: str
    sympy: str


class DecomposeResponse(BaseModel):
    whole_latex: str
    structure: str  # "sum" | "product" | "power" | "function" | "atomic"
    parts: list[ExprPart]


class ExplainPartRequest(BaseModel):
    whole: str
    part: str


class ExplainPartResponse(BaseModel):
    explanation: str


class ExplainConceptRequest(BaseModel):
    concept: str
    path: list[str] = Field(default_factory=list)  # drill-down ancestors, root first


class ConceptResponse(BaseModel):
    concept: str
    explanation: str
    subconcepts: list[str]
    is_fundamental: bool


# ─── SymPy helpers ───────────────────────────────────────────────────────────

SUPPORTED_OPS = {
    "show",
    "integrate",
    "diff",
    "simplify",
    "factor",
    "expand",
    "solve",
    "limit",
    "series",
    "summation",
    "trigsimp",
    "apart",
    "dsolve",
}

# SymPy treats some single capital letters as built-ins (E = Euler's number,
# I = imaginary unit, etc). In a "show this formula" context the user almost
# always means a plain symbol (E for energy, I for current/inertia). Force them.
_DISPLAY_LOCALS: dict[str, Any] = {
    name: sympy.Symbol(name) for name in ("E", "I", "N", "O", "Q", "S")
}


def _sympify(s: str, *, display: bool = False) -> sympy.Expr:
    try:
        if display:
            return sympy.sympify(s, locals=_DISPLAY_LOCALS)
        return sympy.sympify(s)
    except (sympy.SympifyError, SyntaxError, TypeError) as e:
        raise HTTPException(status_code=400, detail=f"Could not parse expression: {e}")


def _symbol(name: str) -> sympy.Symbol:
    return sympy.Symbol(name)


def _primary_symbol(expr: sympy.Expr) -> str:
    syms = sorted(expr.free_symbols, key=lambda s: str(s))
    if not syms:
        return "x"
    for preferred in ("x", "y", "t", "z", "n"):
        if any(str(s) == preferred for s in syms):
            return preferred
    return str(syms[0])


def _apply_op(expr_str: str, op: str, args: dict[str, Any]) -> TransformResult:
    """Single source of truth for op execution. Used by /transform and /chat-turn."""
    if op not in SUPPORTED_OPS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported op '{op}'. Try one of: {sorted(SUPPORTED_OPS)}",
        )

    # `show` parses in display mode so E/I read as plain symbols.
    expr = _sympify(expr_str, display=(op == "show"))
    input_latex = sympy.latex(expr)

    try:
        if op == "show":
            # Display the expression unchanged — used to put a formula on the
            # board so the user can explore it rather than transform it.
            result = expr
        elif op == "integrate":
            var = _symbol(args.get("var") or _primary_symbol(expr))
            result = sympy.integrate(expr, var)
        elif op == "diff":
            var = _symbol(args.get("var") or _primary_symbol(expr))
            result = sympy.diff(expr, var)
        elif op == "simplify":
            result = sympy.simplify(expr)
        elif op == "factor":
            result = sympy.factor(expr)
        elif op == "expand":
            result = sympy.expand(expr)
        elif op == "solve":
            var = _symbol(args.get("var") or _primary_symbol(expr))
            result = sympy.solve(expr, var)
        elif op == "limit":
            var = _symbol(args.get("var") or _primary_symbol(expr))
            point_raw = args.get("point", 0)
            point = _sympify(str(point_raw)) if not isinstance(point_raw, sympy.Expr) else point_raw
            direction = args.get("direction", "+-")
            if direction not in ("+", "-", "+-"):
                direction = "+-"
            result = sympy.limit(expr, var, point, direction)
        elif op == "series":
            var = _symbol(args.get("var") or _primary_symbol(expr))
            x0_raw = args.get("x0", 0)
            x0 = _sympify(str(x0_raw)) if not isinstance(x0_raw, sympy.Expr) else x0_raw
            n = int(args.get("n", 6))
            result = sympy.series(expr, var, x0, n).removeO()
        elif op == "summation":
            var = _symbol(args.get("var") or _primary_symbol(expr))
            a_raw = args.get("from", 0)
            b_raw = args.get("to", "oo")
            a = _sympify(str(a_raw)) if not isinstance(a_raw, sympy.Expr) else a_raw
            b = _sympify(str(b_raw)) if not isinstance(b_raw, sympy.Expr) else b_raw
            result = sympy.summation(expr, (var, a, b))
        elif op == "trigsimp":
            result = sympy.trigsimp(expr)
        elif op == "apart":
            var = _symbol(args.get("var") or _primary_symbol(expr))
            result = sympy.apart(expr, var)
        elif op == "dsolve":
            # Treat `expr` as the LHS of an ODE in the form `expr = 0`,
            # where the unknown function is `f(x)`. Caller passes args.func
            # (default 'f') and args.var (default 'x').
            fname = str(args.get("func", "f"))
            vname = str(args.get("var") or "x")
            x = sympy.Symbol(vname)
            f = sympy.Function(fname)
            # Replace bare `f` references in the expression with `f(x)` if needed —
            # but the safer pattern is for the caller to write the equation using
            # `f(x)`, `Derivative(f(x), x)`, etc. We just re-sympify with f known.
            local: dict[str, Any] = {fname: f, vname: x}
            eq_expr = sympy.sympify(expr_str, locals=local)
            result = sympy.dsolve(eq_expr, f(x))
        else:
            raise HTTPException(status_code=500, detail="op dispatch broken")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"SymPy failed: {e}")

    return TransformResult(
        input_latex=input_latex,
        output_latex=sympy.latex(result),
        output_sympy=str(result),
        op=op,
    )


# ─── Endpoints ────────────────────────────────────────────────────────────────


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/llm-status", response_model=LlmStatus)
def llm_status() -> LlmStatus:
    return LlmStatus(
        configured=_openai_client is not None,
        model=OPENAI_MODEL if _openai_client is not None else None,
    )


@app.post("/transform", response_model=TransformResult)
def transform(req: TransformRequest) -> TransformResult:
    return _apply_op(req.expr, req.op, req.args)


@app.post("/suggest", response_model=SuggestResponse)
def suggest(req: SuggestRequest) -> SuggestResponse:
    expr = _sympify(req.expr)
    var = _primary_symbol(expr)
    suggestions: list[Suggestion] = []

    has_trig = any(
        expr.has(f) for f in (sympy.sin, sympy.cos, sympy.tan, sympy.sec, sympy.csc, sympy.cot)
    )
    has_exp_log = expr.has(sympy.exp) or expr.has(sympy.log)
    is_polynomial = expr.is_polynomial() if hasattr(expr, "is_polynomial") else False
    has_integral = expr.has(sympy.Integral)
    has_derivative = expr.has(sympy.Derivative)

    if has_integral:
        suggestions.append(Suggestion(op="simplify", label="simplify the integral"))
    if has_derivative:
        suggestions.append(Suggestion(op="simplify", label="simplify the derivative"))

    if is_polynomial and expr.free_symbols:
        suggestions.append(Suggestion(op="factor", label=f"factor as a polynomial in {var}"))
        suggestions.append(Suggestion(op="expand", label="expand"))
        suggestions.append(Suggestion(op="solve", label=f"solve for {var}", args={"var": var}))

    if expr.free_symbols:
        suggestions.append(
            Suggestion(op="diff", label=f"differentiate w.r.t. {var}", args={"var": var})
        )
        suggestions.append(
            Suggestion(op="integrate", label=f"integrate w.r.t. {var}", args={"var": var})
        )

    if has_trig or has_exp_log:
        suggestions.append(Suggestion(op="simplify", label="simplify"))
        suggestions.append(
            Suggestion(
                op="series",
                label=f"Taylor series in {var} at 0",
                args={"var": var, "x0": 0, "n": 6},
            )
        )

    seen: set[tuple[str, str]] = set()
    unique: list[Suggestion] = []
    for s in suggestions:
        key = (s.op, s.label)
        if key in seen:
            continue
        seen.add(key)
        unique.append(s)
        if len(unique) >= 5:
            break

    if not unique:
        unique.append(Suggestion(op="simplify", label="simplify"))

    return SuggestResponse(suggestions=unique)


# ─── Expression decomposition ─────────────────────────────────────────────────


def _part(kind: str, label: str, sub: sympy.Expr) -> ExprPart:
    return ExprPart(kind=kind, label=label, latex=sympy.latex(sub), sympy=str(sub))


@app.post("/decompose", response_model=DecomposeResponse)
def decompose(req: DecomposeRequest) -> DecomposeResponse:
    """Split an expression into its top-level structural parts.

    This is the basis for "explain each part of the equation": the frontend
    renders each part as a hoverable/clickable chip.
    """
    expr = _sympify(req.expr)
    parts: list[ExprPart] = []
    structure = "atomic"

    if expr.is_Add:
        structure = "sum"
        terms = expr.as_ordered_terms()
        for i, t in enumerate(terms):
            parts.append(_part("term", f"term {i + 1} of {len(terms)}", t))
    elif expr.is_Mul:
        structure = "product"
        factors = list(expr.as_ordered_factors())
        for i, f in enumerate(factors):
            parts.append(_part("factor", f"factor {i + 1} of {len(factors)}", f))
    elif expr.is_Pow:
        structure = "power"
        parts.append(_part("base", "base", expr.base))
        parts.append(_part("exponent", "exponent", expr.exp))
    elif isinstance(expr, sympy.Function):
        structure = "function"
        fname = type(expr).__name__
        for i, a in enumerate(expr.args):
            parts.append(_part("argument", f"argument {i + 1} of {fname}", a))
    elif isinstance(expr, (sympy.Equality, sympy.Eq)):
        structure = "equation"
        parts.append(_part("term", "left-hand side", expr.lhs))
        parts.append(_part("term", "right-hand side", expr.rhs))

    return DecomposeResponse(
        whole_latex=sympy.latex(expr),
        structure=structure,
        parts=parts,
    )


@app.post("/explain-part", response_model=ExplainPartResponse)
def explain_part(req: ExplainPartRequest) -> ExplainPartResponse:
    """Ask the LLM to explain one part's role within the whole expression."""
    # SymPy-validate both inputs first so we never explain nonsense.
    whole = _sympify(req.whole)
    part = _sympify(req.part)

    if _openai_client is None:
        # Fallback: a structural description without the LLM.
        return ExplainPartResponse(
            explanation=(
                f"This part is `{part}`. "
                f"(LLM is off — set OPENAI_API_KEY for a richer explanation.)"
            )
        )

    prompt = (
        f"In the mathematical expression  {whole}  consider the sub-expression  {part} .\n"
        f"Explain, in 1-2 sentences for a researcher, what role this sub-expression plays "
        f"in the whole — what it represents and why it is there. Do not restate the whole "
        f"expression. Be specific and concise. Plain text only."
    )
    try:
        resp = _openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            max_completion_tokens=2048,
            messages=[
                {
                    "role": "system",
                    "content": "You are Nabla, explaining parts of math expressions to researchers. Terse, precise, no fluff.",
                },
                {"role": "user", "content": prompt},
            ],
        )
        text = (resp.choices[0].message.content or "").strip()
        if not text:
            text = f"This sub-expression is `{part}`."
        return ExplainPartResponse(explanation=text)
    except Exception as e:
        logger.warning("explain-part LLM error: %s", e)
        return ExplainPartResponse(
            explanation=f"This sub-expression is `{part}`. (LLM explanation unavailable: {e})"
        )


# ─── Concept drill-down ───────────────────────────────────────────────────────

CONCEPT_TOOL: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "concept_breakdown",
            "description": "Explain a concept and point toward the more fundamental concepts it rests on.",
            "parameters": {
                "type": "object",
                "properties": {
                    "explanation": {
                        "type": "string",
                        "description": "2-4 sentence explanation of the concept, pitched for a curious researcher who just drilled down from the parent concept.",
                    },
                    "subconcepts": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "2-4 MORE FUNDAMENTAL concepts this one is built from or defined in terms of — what to drill into next to get closer to first principles. Empty if this concept is already fundamental. Each item is a short noun phrase.",
                    },
                    "is_fundamental": {
                        "type": "boolean",
                        "description": "True if this concept cannot be reduced further: a primitive physical quantity (length, time, mass, charge), a mathematical axiom or primitive, or an empirical constant of nature.",
                    },
                },
                "required": ["explanation", "subconcepts", "is_fundamental"],
            },
        },
    }
]

CONCEPT_SYSTEM = """You help a researcher understand a concept by drilling down toward first principles — like peeling an onion until you reach bedrock.

You are given the current concept and the drill-down path that led to it (root first). Call concept_breakdown exactly once:
- explanation: explain the current concept concisely, at a depth appropriate to someone who just arrived here from the parent concept. Be precise; assume intelligence.
- subconcepts: list 2-4 MORE FUNDAMENTAL concepts the current one is built from or defined in terms of. These are what the user drills into next. Move genuinely DOWNWARD toward primitives — do not list siblings or applications. Each is a short noun phrase.
- is_fundamental: true ONLY when the concept genuinely cannot be reduced further — a base physical quantity (length, time, mass, electric charge), a mathematical axiom or primitive notion (set, point, the successor function), or an empirical constant of nature (speed of light, Planck's constant). When true, return an empty subconcepts list.

Stay on a coherent path to bedrock. Example chain: "kinetic energy" -> "energy" -> "work" -> "force" -> "mass" + "acceleration" -> "acceleration" -> "velocity" + "time" -> "time" (fundamental)."""


@app.post("/explain-concept", response_model=ConceptResponse)
def explain_concept(req: ExplainConceptRequest) -> ConceptResponse:
    """Recursive drill-down: explain a concept and surface the more fundamental
    concepts beneath it, so the user can climb all the way down to first
    principles."""
    concept = req.concept.strip()
    if not concept:
        raise HTTPException(status_code=400, detail="Empty concept.")

    if _openai_client is None:
        return ConceptResponse(
            concept=concept,
            explanation=f"'{concept}' — set OPENAI_API_KEY for concept drill-down.",
            subconcepts=[],
            is_fundamental=True,
        )

    path_str = " -> ".join(req.path) if req.path else "(this is the starting concept)"
    user_msg = (
        f"Drill-down path so far (root first): {path_str}\n"
        f"Current concept to break down: {concept}"
    )

    try:
        resp = _openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            max_completion_tokens=2048,
            messages=[
                {"role": "system", "content": CONCEPT_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
            tools=CONCEPT_TOOL,
            tool_choice="required",
        )
        tcs = resp.choices[0].message.tool_calls or []
        if not tcs:
            raise ValueError("no tool call")
        data = json.loads(tcs[0].function.arguments or "{}")
        subs = data.get("subconcepts") or []
        is_fund = bool(data.get("is_fundamental", False))
        if is_fund:
            subs = []
        return ConceptResponse(
            concept=concept,
            explanation=data.get("explanation", f"'{concept}'."),
            subconcepts=[str(s) for s in subs][:4],
            is_fundamental=is_fund,
        )
    except Exception as e:
        logger.warning("explain-concept error: %s", e)
        return ConceptResponse(
            concept=concept,
            explanation=f"Could not break down '{concept}': {e}",
            subconcepts=[],
            is_fundamental=True,
        )


# ─── LLM-driven chat turn ─────────────────────────────────────────────────────


def _build_user_turn_with_context(
    user_text: str, active_expr: str | None, active_op: str | None
) -> str:
    """Inject the current board state into the user's message."""
    if active_expr is None:
        ctx = "[board context: empty]"
    else:
        op_part = f", produced by `{active_op}`" if active_op else ""
        ctx = f"[board context: active expression is `{active_expr}`{op_part}]"
    return f"{user_text}\n\n{ctx}"


def _call_openai(history: list[ChatMessage], active_expr: str | None, active_op: str | None):
    assert _openai_client is not None

    messages: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for i, m in enumerate(history):
        is_last_user = i == len(history) - 1 and m.role == "user"
        content = (
            _build_user_turn_with_context(m.content, active_expr, active_op)
            if is_last_user
            else m.content
        )
        messages.append({"role": m.role, "content": content})

    # GPT-5 family burns reasoning tokens against max_completion_tokens, so keep this generous.
    return _openai_client.chat.completions.create(
        model=OPENAI_MODEL,
        max_completion_tokens=4096,
        messages=messages,
        tools=TOOLS,
        tool_choice="required",  # force a tool call, no plain text
    )


@app.post("/chat-turn", response_model=ChatTurnResponse)
def chat_turn(req: ChatTurnRequest) -> ChatTurnResponse:
    if _openai_client is None:
        return ChatTurnResponse(
            kind="error",
            message="LLM not configured. Set OPENAI_API_KEY in apps/api/.env.",
        )
    if not req.history:
        return ChatTurnResponse(kind="error", message="Empty chat history.")

    try:
        resp = _call_openai(req.history, req.active_expr, req.active_op)
    except OpenAIAPIStatusError as e:
        try:
            payload = e.response.json()
            detail = payload.get("error", {}).get("message") or str(e)
        except Exception:
            detail = str(e)
        logger.warning("OpenAI API status error: %s", detail)
        return ChatTurnResponse(kind="error", message=detail)
    except OpenAIAPIError as e:
        logger.warning("OpenAI API error: %s", e)
        return ChatTurnResponse(kind="error", message=f"LLM error: {e}")
    except Exception as e:
        logger.exception("Unexpected LLM error")
        return ChatTurnResponse(kind="error", message=f"LLM unreachable: {e}")

    choice = resp.choices[0]
    msg = choice.message
    tool_calls = msg.tool_calls or []

    if not tool_calls:
        # GPT-5 should always tool-call given tool_choice='required', but handle the failure
        text = msg.content or "Model did not emit a tool call."
        if choice.finish_reason == "length":
            text = "LLM ran out of token budget mid-response. Try again with a shorter prompt."
        return ChatTurnResponse(kind="error", message=text)

    tc = tool_calls[0]
    tool_name = tc.function.name
    try:
        tool_input: dict[str, Any] = json.loads(tc.function.arguments or "{}")
    except json.JSONDecodeError:
        return ChatTurnResponse(
            kind="error", message=f"LLM emitted malformed tool arguments: {tc.function.arguments}"
        )

    if tool_name == "ask_clarification":
        question = tool_input.get("question", "Could you clarify?")
        return ChatTurnResponse(kind="clarification", message=question)

    if tool_name == "apply_transform":
        op = tool_input.get("op")
        if op not in SUPPORTED_OPS:
            return ChatTurnResponse(
                kind="error", message=f"LLM proposed unsupported op '{op}'."
            )
        explanation = tool_input.get("explanation", "")
        proposed_expr: str | None = tool_input.get("expr")
        var: str | None = tool_input.get("var")

        expr_to_use = proposed_expr if proposed_expr is not None else req.active_expr
        if not expr_to_use:
            return ChatTurnResponse(
                kind="clarification",
                message="The board is empty — could you give me an expression to start with?",
            )

        merged_args: dict[str, Any] = dict(tool_input.get("args") or {})
        if var:
            merged_args["var"] = var
        try:
            result = _apply_op(expr_to_use, op, merged_args)
        except HTTPException as e:
            return ChatTurnResponse(
                kind="error",
                message=f"SymPy rejected the proposed move: {e.detail}",
            )

        return ChatTurnResponse(
            kind="transform",
            message=explanation,
            transform=result,
            expr_used=expr_to_use,
            op_used=op,
            var_used=var,
        )

    return ChatTurnResponse(
        kind="error", message=f"LLM emitted unknown tool '{tool_name}'."
    )
