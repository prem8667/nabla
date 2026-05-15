"""Nabla API — V0.1.

Endpoints:
  GET  /health
  POST /transform    apply a SymPy op
  POST /suggest      propose plausible next ops for an expression

SymPy is the oracle — bad input fails loudly.
"""

from __future__ import annotations

from typing import Any

import sympy
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Nabla API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class TransformRequest(BaseModel):
    expr: str
    op: str
    args: dict[str, Any] = {}


class TransformResponse(BaseModel):
    input_latex: str
    output_latex: str
    output_sympy: str
    op: str


class SuggestRequest(BaseModel):
    expr: str


class Suggestion(BaseModel):
    op: str
    label: str
    args: dict[str, Any] = {}


class SuggestResponse(BaseModel):
    suggestions: list[Suggestion]


SUPPORTED_OPS = {"integrate", "diff", "simplify", "factor", "expand", "solve"}


def _sympify(s: str) -> sympy.Expr:
    try:
        return sympy.sympify(s)
    except (sympy.SympifyError, SyntaxError, TypeError) as e:
        raise HTTPException(status_code=400, detail=f"Could not parse expression: {e}")


def _symbol(name: str) -> sympy.Symbol:
    return sympy.Symbol(name)


def _primary_symbol(expr: sympy.Expr) -> str:
    """Pick a sensible default variable for unary ops."""
    syms = sorted(expr.free_symbols, key=lambda s: str(s))
    if not syms:
        return "x"
    for preferred in ("x", "y", "t", "z"):
        if any(str(s) == preferred for s in syms):
            return preferred
    return str(syms[0])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/transform", response_model=TransformResponse)
def transform(req: TransformRequest) -> TransformResponse:
    if req.op not in SUPPORTED_OPS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported op '{req.op}'. Try one of: {sorted(SUPPORTED_OPS)}",
        )

    expr = _sympify(req.expr)
    input_latex = sympy.latex(expr)

    try:
        if req.op == "integrate":
            var = _symbol(req.args.get("var") or _primary_symbol(expr))
            result = sympy.integrate(expr, var)
        elif req.op == "diff":
            var = _symbol(req.args.get("var") or _primary_symbol(expr))
            result = sympy.diff(expr, var)
        elif req.op == "simplify":
            result = sympy.simplify(expr)
        elif req.op == "factor":
            result = sympy.factor(expr)
        elif req.op == "expand":
            result = sympy.expand(expr)
        elif req.op == "solve":
            var = _symbol(req.args.get("var") or _primary_symbol(expr))
            result = sympy.solve(expr, var)
        else:
            raise HTTPException(status_code=500, detail="op dispatch broken")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"SymPy failed: {e}")

    return TransformResponse(
        input_latex=input_latex,
        output_latex=sympy.latex(result),
        output_sympy=str(result),
        op=req.op,
    )


@app.post("/suggest", response_model=SuggestResponse)
def suggest(req: SuggestRequest) -> SuggestResponse:
    """Heuristic next-move suggestions for an expression."""
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
    is_equation_like = expr.is_Add or expr.is_Mul or expr.is_Pow

    if has_integral:
        suggestions.append(Suggestion(op="simplify", label="simplify the integral"))
    if has_derivative:
        suggestions.append(Suggestion(op="simplify", label="simplify the derivative"))

    if is_polynomial and expr.free_symbols:
        suggestions.append(Suggestion(op="factor", label=f"factor as a polynomial in {var}"))
        suggestions.append(Suggestion(op="expand", label="expand"))
        suggestions.append(
            Suggestion(op="solve", label=f"solve for {var}", args={"var": var})
        )

    if expr.free_symbols:
        suggestions.append(
            Suggestion(op="diff", label=f"differentiate w.r.t. {var}", args={"var": var})
        )
        suggestions.append(
            Suggestion(op="integrate", label=f"integrate w.r.t. {var}", args={"var": var})
        )

    if has_trig or has_exp_log:
        suggestions.append(Suggestion(op="simplify", label="simplify"))

    # Dedupe by (op, label) preserving order, cap at 5
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
