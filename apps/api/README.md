# Nabla API

FastAPI + SymPy. V0 vertical slice — one endpoint, `POST /transform`.

## Run locally

```powershell
# from repo root
cd apps/api
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The server runs on http://localhost:8000.

## Endpoints

### `GET /health`

Returns `{"status": "ok"}`.

### `POST /transform`

Apply a symbolic operation to an expression.

```json
{
  "expr": "x*sin(x)",
  "op": "integrate",
  "args": { "var": "x" }
}
```

Response:

```json
{
  "input_latex": "x \\sin{\\left(x \\right)}",
  "output_latex": "- x \\cos{\\left(x \\right)} + \\sin{\\left(x \\right)}",
  "output_sympy": "-x*cos(x) + sin(x)",
  "op": "integrate"
}
```

Supported ops: `integrate`, `diff`, `simplify`, `factor`, `expand`, `solve`.

For `integrate`, `diff`, and `solve`, `args.var` defaults to `"x"`.
