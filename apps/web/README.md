# Nabla Web

Next.js 15 + Tailwind + KaTeX. V0 vertical slice — three panes wired to the API.

## Run locally

```powershell
cd apps/web
npm install
npm run dev
```

Open http://localhost:3000.

The API must be running too — see `apps/api/README.md`.

## Layout

- **Left**: `ChatPane` — accepts commands like `integrate x*sin(x) dx`. V1 will replace this with an LLM.
- **Middle**: `BoardPane` — renders the latest step (input → output via KaTeX). A vertical timeline on the left edge lets you jump between history nodes.
- **Right**: `ScratchPane` — plain textarea. Not sent to the backend or AI.

## Supported commands (V0)

```
integrate x*sin(x) dx
d/dx exp(x)*x**2
diff x**2 dx
simplify sin(x)**2 + cos(x)**2
factor x**2 + 2*x*y + y**2
expand (x+1)**3
solve x**3 - 6*x**2 + 11*x - 6 for x
```

## Env

Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_API_BASE` if your API isn't on `http://localhost:8000`.
