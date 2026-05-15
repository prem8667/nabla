# Nabla API

FastAPI + SymPy + OpenAI GPT-5 Mini (for natural-language chat).

## Run locally

```powershell
# from repo root
cd apps/api
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env
# Edit .env and fill in OPENAI_API_KEY
uvicorn main:app --port 8000
```

The server runs on http://localhost:8000. Use `--reload` if you want auto-restart on code changes.

## Env vars

| Var | Required | Default | What it does |
|---|---|---|---|
| `OPENAI_API_KEY` | for chat | none | API key from https://platform.openai.com/api-keys. Without it, `/chat-turn` returns errors and the frontend falls back to its regex parser. |
| `OPENAI_MODEL` | no | `gpt-5-mini` | Which OpenAI chat model to use. |

## Endpoints

### `GET /health`
Returns `{"status": "ok"}`.

### `GET /llm-status`
Returns `{"configured": bool, "model": str | null}`. Frontend uses this to show an LLM on/off indicator.

### `POST /transform`

Apply a symbolic operation directly (no LLM). Used by chips and the structured-command fallback.

```json
{ "expr": "x*sin(x)", "op": "integrate", "args": { "var": "x" } }
```

Returns:
```json
{
  "input_latex": "x \\sin{\\left(x \\right)}",
  "output_latex": "- x \\cos{\\left(x \\right)} + \\sin{\\left(x \\right)}",
  "output_sympy": "-x*cos(x) + sin(x)",
  "op": "integrate"
}
```

### `POST /suggest`

Heuristic next-move suggestions for an expression.

```json
{ "expr": "exp(x)*x" }
```

Returns up to 5 suggestions, each `{ op, label, args }`.

### `POST /chat-turn`

The LLM-driven path. Takes the conversation history + current board state, returns either an executed transform or a clarification question.

```json
{
  "history": [
    { "role": "user", "content": "find the integral of x sin x" }
  ],
  "active_expr": null,
  "active_op": null
}
```

Response:
```json
{
  "kind": "transform" | "clarification" | "error",
  "message": "...",
  "transform": { ... } | null,
  "expr_used": "x*sin(x)" | null,
  "op_used": "integrate" | null,
  "var_used": "x" | null
}
```

## Supported ops

`integrate`, `diff`, `simplify`, `factor`, `expand`, `solve`, `limit`, `series`, `summation`. See `apps/api/main.py` `_apply_op` for the exact arg shapes per op.
