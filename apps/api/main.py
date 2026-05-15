"""Nabla API — V1.

Endpoints:
  GET  /health
  GET  /llm-status     whether the LLM is configured and reachable
  POST /transform      apply a SymPy op directly (used by chips and fallback)
  POST /suggest        propose plausible next ops for an expression
  POST /chat-turn      LLM-driven: user message in, transform or clarification out

SymPy is the oracle — every transformation, whether typed, chip-clicked, or
LLM-proposed, is computed and validated by SymPy. The LLM only chooses the move
and explains it.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Literal

import sympy
from anthropic import Anthropic, APIError, APIStatusError
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()
logger = logging.getLogger("nabla")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Nabla API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── LLM client ──────────────────────────────────────────────────────────────

ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")
_anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
_anthropic_client: Anthropic | None = Anthropic(api_key=_anthropic_key) if _anthropic_key else None

SYSTEM_PROMPT = """You are Nabla, a math-derivation assistant. The user is a researcher working through a derivation on a three-pane workspace; the middle pane shows their currently active expression.

Your job: turn each user message into exactly ONE tool call.
- Use `apply_transform` when the user wants a symbolic operation on an expression.
- Use `ask_clarification` only when the input genuinely cannot be turned into a transform.

Hard rules:
- ALWAYS emit exactly one tool call. Never produce a plain text answer. Never write math in prose. SymPy will do the computation.
- Use SymPy syntax in `expr`: `x**2` (not x^2), `x*sin(x)`, `exp(x)`, `log(x)`, `pi`, `sqrt(x)`, `oo` for infinity.
- When the user means "apply this to what is on the board" (e.g. "simplify that", "now differentiate it", "factor the result"), OMIT `expr`. The backend will use the active step's output.
- When the user introduces a fresh expression, PROVIDE `expr`.
- `var` is optional. Provide it only when the user names a variable, or when more than one symbol is present and the choice would otherwise be ambiguous.
- `explanation` is one or two short sentences a researcher would find useful — say *why* this move makes sense for the current state, not how to do it.

Supported ops:
- integrate (var optional)
- diff (var optional)
- simplify
- factor
- expand
- solve (var optional; treats the expression as `expr = 0`)

If the user's request maps to multiple ops in sequence (e.g. "find the integral and then simplify it"), pick the FIRST step only. The user can chain further with another turn or a chip click.
"""

TOOLS: list[dict[str, Any]] = [
    {
        "name": "apply_transform",
        "description": "Apply a single symbolic math operation. SymPy will execute it.",
        "input_schema": {
            "type": "object",
            "properties": {
                "op": {
                    "type": "string",
                    "enum": ["integrate", "diff", "simplify", "factor", "expand", "solve"],
                    "description": "Which operation to apply.",
                },
                "expr": {
                    "type": "string",
                    "description": "SymPy-parseable expression. OMIT this field when applying the op to the current active board state.",
                },
                "var": {
                    "type": "string",
                    "description": "Variable name (e.g. 'x'). Only needed for integrate/diff/solve when not obvious from context.",
                },
                "explanation": {
                    "type": "string",
                    "description": "1-2 sentences explaining why this move makes sense for a researcher.",
                },
            },
            "required": ["op", "explanation"],
        },
    },
    {
        "name": "ask_clarification",
        "description": "Ask the user a clarifying question when their input genuinely cannot be turned into a transform.",
        "input_schema": {
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


# ─── SymPy helpers ───────────────────────────────────────────────────────────

SUPPORTED_OPS = {"integrate", "diff", "simplify", "factor", "expand", "solve"}


def _sympify(s: str) -> sympy.Expr:
    try:
        return sympy.sympify(s)
    except (sympy.SympifyError, SyntaxError, TypeError) as e:
        raise HTTPException(status_code=400, detail=f"Could not parse expression: {e}")


def _symbol(name: str) -> sympy.Symbol:
    return sympy.Symbol(name)


def _primary_symbol(expr: sympy.Expr) -> str:
    syms = sorted(expr.free_symbols, key=lambda s: str(s))
    if not syms:
        return "x"
    for preferred in ("x", "y", "t", "z"):
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

    expr = _sympify(expr_str)
    input_latex = sympy.latex(expr)

    try:
        if op == "integrate":
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
        configured=_anthropic_client is not None,
        model=ANTHROPIC_MODEL if _anthropic_client is not None else None,
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


# ─── LLM-driven chat turn ─────────────────────────────────────────────────────


def _build_user_turn_with_context(
    user_text: str, active_expr: str | None, active_op: str | None
) -> str:
    """Inject the current board state into the user's message so the model has it without us caching it."""
    if active_expr is None:
        ctx = "[board context: empty]"
    else:
        op_part = f", produced by `{active_op}`" if active_op else ""
        ctx = f"[board context: active expression is `{active_expr}`{op_part}]"
    return f"{user_text}\n\n{ctx}"


def _call_anthropic(history: list[ChatMessage], active_expr: str | None, active_op: str | None):
    assert _anthropic_client is not None

    # Build the messages list. Inject context only into the LAST user message so the cached
    # prefix (system + tools) stays stable across turns.
    messages: list[dict[str, Any]] = []
    for i, m in enumerate(history):
        is_last_user = i == len(history) - 1 and m.role == "user"
        content = (
            _build_user_turn_with_context(m.content, active_expr, active_op)
            if is_last_user
            else m.content
        )
        messages.append({"role": m.role, "content": content})

    return _anthropic_client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=512,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        tools=TOOLS,
        tool_choice={"type": "any"},  # force tool use, no plain-text replies
        messages=messages,
    )


@app.post("/chat-turn", response_model=ChatTurnResponse)
def chat_turn(req: ChatTurnRequest) -> ChatTurnResponse:
    if _anthropic_client is None:
        return ChatTurnResponse(
            kind="error",
            message="LLM not configured. Set ANTHROPIC_API_KEY in apps/api/.env.",
        )
    if not req.history:
        return ChatTurnResponse(kind="error", message="Empty chat history.")

    try:
        resp = _call_anthropic(req.history, req.active_expr, req.active_op)
    except APIStatusError as e:
        # Surface credit / rate-limit errors directly
        try:
            payload = e.response.json()
            detail = payload.get("error", {}).get("message") or str(e)
        except Exception:
            detail = str(e)
        logger.warning("Anthropic API error: %s", detail)
        return ChatTurnResponse(kind="error", message=detail)
    except APIError as e:
        logger.warning("Anthropic error: %s", e)
        return ChatTurnResponse(kind="error", message=f"LLM error: {e}")
    except Exception as e:  # network etc.
        logger.exception("Unexpected LLM error")
        return ChatTurnResponse(kind="error", message=f"LLM unreachable: {e}")

    # Extract the first tool_use block
    tool_block = next((b for b in resp.content if b.type == "tool_use"), None)
    if tool_block is None:
        # Model went rogue and produced text — surface it so we don't silently drop it
        text_block = next((b for b in resp.content if b.type == "text"), None)
        msg = text_block.text if text_block else "Model did not emit a tool call."
        return ChatTurnResponse(kind="error", message=msg)

    tool_name = tool_block.name
    tool_input: dict[str, Any] = dict(tool_block.input) if hasattr(tool_block, "input") else {}

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

        # If the model omitted expr, use the active board state.
        expr_to_use = proposed_expr if proposed_expr is not None else req.active_expr
        if not expr_to_use:
            return ChatTurnResponse(
                kind="clarification",
                message="The board is empty — could you give me an expression to start with?",
            )

        args: dict[str, Any] = {"var": var} if var else {}
        try:
            result = _apply_op(expr_to_use, op, args)
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
