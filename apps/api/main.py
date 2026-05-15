"""Nabla API — V0 vertical slice.

One endpoint: POST /transform. Takes a SymPy-parseable expression, an op name,
and op-specific args; returns the result as LaTeX. SymPy is the oracle — bad
input fails loudly, not silently.
"""

from __future__ import annotations

from typing import Any

import sympy
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Nabla API", version="0.0.1")

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


SUPPORTED_OPS = {"integrate", "diff", "simplify", "factor", "expand", "solve"}


def _sympify(s: str) -> sympy.Expr:
    try:
        return sympy.sympify(s)
    except (sympy.SympifyError, SyntaxError, TypeError) as e:
        raise HTTPException(status_code=400, detail=f"Could not parse expression: {e}")


def _symbol(name: str) -> sympy.Symbol:
    return sympy.Symbol(name)


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
            var = _symbol(req.args.get("var", "x"))
            result = sympy.integrate(expr, var)
        elif req.op == "diff":
            var = _symbol(req.args.get("var", "x"))
            result = sympy.diff(expr, var)
        elif req.op == "simplify":
            result = sympy.simplify(expr)
        elif req.op == "factor":
            result = sympy.factor(expr)
        elif req.op == "expand":
            result = sympy.expand(expr)
        elif req.op == "solve":
            var = _symbol(req.args.get("var", "x"))
            result = sympy.solve(expr, var)
        else:
            # Unreachable — SUPPORTED_OPS guards this
            raise HTTPException(status_code=500, detail="op dispatch broken")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"SymPy failed: {e}")

    return TransformResponse(
        input_latex=input_latex,
        output_latex=sympy.latex(result),
        output_sympy=str(result),
        op=req.op,
    )
