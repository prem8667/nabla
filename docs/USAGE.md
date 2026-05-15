# Using Nabla

This guide walks through everything Nabla does today (V0.1), how to run it, how to use the UI, and what's still on the roadmap.

---

## 1. What Nabla is

A three-pane workspace for working through math derivations:

| Pane | Purpose |
|---|---|
| **Chat** (left) | Where you tell Nabla what to do. Today: structured commands. Tomorrow: natural language via LLM. |
| **Board** (middle) | The live equation. Every step you take becomes a node. The active node is what you see; the timeline shows the rest. |
| **Scratch** (right) | A plain textarea for rough notes. Never sent anywhere. |

Under the hood, the math itself is computed by **SymPy** (a real symbolic math engine). The LLM, when added, will propose moves but never decide if they're correct — SymPy is the oracle.

---

## 2. Running it locally

You need two terminals: one for the backend, one for the frontend.

### Backend (Python 3.13+ via `py` launcher)

```powershell
cd apps/api
py -m venv .venv                            # one-time
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt             # one-time
.\.venv\Scripts\uvicorn main:app --reload --port 8000
```

The API will be on http://localhost:8000. Two endpoints:

- `POST /transform` — apply an op to an expression
- `POST /suggest` — propose plausible next ops

### Frontend (Node 20+)

```powershell
cd apps/web
npm install                                  # one-time
npm run dev
```

Open http://localhost:3000.

---

## 3. The UI — what every piece means

```
┌─────────────────────┬──────────────────────────────────────┬──────────────────┐
│ CHAT                │ BOARD              [1·int · 2·diff]  │ SCRATCH          │
│                     │                       ↑ breadcrumb   │                  │
│ → user message      │ ┌────┐                               │                  │
│   Nabla reply       │ │ 1  │        INTEGRATE              │ Free textarea    │
│                     │ │int │        x sin(x)               │ for your notes.  │
│                     │ │    │            ↓                  │                  │
│ ┌────┐              │ │ 2  │        -x cos(x) + sin(x)     │ Not sent to      │
│ │ 3  │              │ │diff│                               │ backend or LLM   │
│ │sim │              │ └────┘                               │ in V0.1.         │
│ └────┘              │  ↑                                   │                  │
│                     │  Timeline column                     │                  │
│                     │  (depth-indented tree)               │                  │
│                     │                                      │                  │
│                     │   ( diff w.r.t. x )                  │                  │
│                     │   ( integrate w.r.t. x )             │                  │
│                     │   ( simplify )                       │                  │
│                     │   ↑ future-move chips                │                  │
│                     │                                      │                  │
│ [type a command…]   │                                      │                  │
│ [Submit]            │                                      │                  │
└─────────────────────┴──────────────────────────────────────┴──────────────────┘
```

### Chat pane

- The text input at the bottom is where you type commands.
- **Enter** submits. **Shift+Enter** inserts a newline.
- Above the input is the history of what you've sent and what Nabla replied with.

### Board pane

The board has four layers, from outside in:

1. **Breadcrumb (top row)** — the path of steps from the root to the currently selected step. Each pill is clickable; click to jump to that step.
2. **Timeline column (left edge)** — every step in the session, arranged as a tree. The currently selected step is highlighted in blue. Children are indented under their parent. Branched siblings (a step that wasn't the first child of its parent) get an accent border so you can spot forks.
3. **Active step (centre)** — shows the input expression (faded), an arrow, and the output expression (large). The label above says which op was applied (`integrate`, `diff`, etc.). A tiny line of plain text below shows the raw SymPy form.
4. **Future-moves chips (below the equation)** — three to five clickable pills suggesting plausible next ops. Click any pill to apply that op to the current output.

### Scratch pane

Plain textarea. Type whatever you want. It is never sent to the backend or to any LLM. In V2 we'll add a "send to chat" button so you can promote scratch notes into the derivation.

---

## 4. Talking to Nabla — natural language (V1)

If the LLM is configured (`ANTHROPIC_API_KEY` set in `apps/api/.env`), the chat indicator at the top of the chat pane shows **LLM on**, and you can just write in your own words:

```
find the integral of x sin x
now differentiate that
what are the roots of x cubed minus six x squared plus eleven x minus six
factor it as a polynomial in y
simplify
```

Claude Sonnet 4.6 reads your message plus the current board state, picks the right symbolic operation, and emits it as a structured tool call. The backend then validates and executes the move through SymPy — so the LLM never decides whether the math is right, only what to try.

If your input is genuinely ambiguous (e.g. "do something interesting" with an empty board), the LLM will ask a clarifying question instead of guessing.

### How chaining works in natural language

When you say "that" or "it" or just "simplify", the backend tells the LLM what's currently on the board, and the LLM produces a tool call with no `expr` field — meaning "use the active output." Same chain pattern as the structured commands, just easier to type.

### When the LLM is off (no key, or it errored)

The chat indicator shows **LLM off** and the placeholder switches to structured-command syntax. Use the commands described below.

## 5. Structured commands (V0.1 — still works as a fallback)

Two forms of structured command. Both still work whether or not the LLM is on — if the LLM call fails for any reason (credit exhausted, network blip, anything), Nabla automatically falls back to parsing your input as a structured command.

### Form A — with an expression

You provide both the op and the math.

```
integrate x*sin(x) dx
diff x**3 + 2*x dx
simplify sin(x)**2 + cos(x)**2
factor x**2 + 2*x*y + y**2
expand (x + 1)**3
solve x**3 - 6*x**2 + 11*x - 6 for x
d/dx exp(x)*x**2
```

This starts a **new derivation** — it does not extend the current chain. Use it for the first step, or to introduce a brand-new equation.

### Form B — op-only

You type just the op. Nabla uses the **active step's output** as the input.

```
simplify
factor
diff
diff dy            (differentiate w.r.t. y)
integrate
solve for x
```

This is how you **chain** a derivation. Start with Form A to introduce an expression, then use Form B (or click chips) to apply moves to the running result.

### The fastest way: click chips

You almost never need to type Form B by hand. After every transform, the chip row updates with the most useful next moves. Click one to apply it.

---

## 5. Branching — going back and trying something else

Every step has a parent. By default, the parent of a new step is whichever step is currently active.

- If the active step is the most recent one (no children yet) → the new step is linear (becomes the next link in the chain).
- If the active step **already has children** → the new step is a **sibling branch**. Both children remain in the graph; only one is "active" at a time.

To branch deliberately:

1. Click an older dot in the timeline column. The board jumps to that step.
2. Type a new command (or click a different chip). The new step is added as a child of that older step — a fork.

The original chain is not deleted. Switch between branches by clicking dots in the timeline.

---

## 6. The data flow (what happens when you hit Submit)

```
┌──────────┐  parse command   ┌──────────┐  HTTP POST    ┌──────────┐
│ Chat     │ ───────────────▶ │ Frontend │ ────────────▶ │ Backend  │
│ input    │  (lib/parse.ts)  │  state   │  /transform   │ FastAPI  │
└──────────┘                  └──────────┘                └────┬─────┘
                                   ▲                            │
                                   │ TransformResponse          │ sympify + op
                                   │  { input_latex,            │ + sympy.latex
                                   │    output_latex,           │
                                   │    output_sympy }          ▼
                                   │                       ┌──────────┐
                                   │                       │  SymPy   │
                                   └───────────────────────┤  oracle  │
                                                           └──────────┘
       After the new step is added:
       Frontend calls POST /suggest with the new output's SymPy form,
       gets back 3–5 chips, renders them under the active step.
```

If SymPy can't parse the expression or the op fails, the backend returns HTTP 400 with the error. The frontend shows that as a red system message in chat.

---

## 7. Operations supported

| Op | What it does | Args |
|---|---|---|
| `integrate` | Indefinite integral | `var` (defaults to detected primary symbol) |
| `diff` | Derivative | `var` (defaults to detected primary symbol) |
| `simplify` | General simplification | none |
| `factor` | Factor as a polynomial | none |
| `expand` | Algebraic expansion | none |
| `solve` | Solve `expr = 0` | `var` |
| `limit` | Limit as `var → point` | `var`, `args.point` (default 0), `args.direction` (`'+'`/`'-'`/`'+-'`) |
| `series` | Taylor / Maclaurin expansion | `var`, `args.x0` (default 0), `args.n` (truncation order, default 6) |
| `summation` | Sum of expr over var | `var`, `args.from` (default 0), `args.to` (default `'oo'` for infinity) |

The "primary symbol" detection picks `x` if present, otherwise `y`, `t`, `z`, then whichever symbol is alphabetically first.

You almost never need to pass `args` by hand — the LLM and chip suggestions fill them in. They're documented here so you know what's possible.

---

## 8. What's still missing (the roadmap)

| Feature | Status | Notes |
|---|---|---|
| **LLM in chat** | ✅ Shipped (V1) | Claude Sonnet 4.6 via Anthropic tool-calling. Natural language works; structured commands stay as a fallback. |
| **Hover-history on terms** | Not started | Click any sub-term in the rendered equation → see where it came from. Needs per-term provenance from SymPy. |
| **Visual branch connectors** | Partial | Timeline shows tree depth via indent, but no drawn lines yet. |
| **Persistence** | Not started | Refresh wipes the session. Needs IndexedDB. |
| **Step-by-step internal trace** | Not started | Double-click a step → show SymPy's intermediate steps. |
| **Scratch → chat integration** | Not started | "Send selection to chat" lets the LLM read your scratch notes. |
| **Real-time collaboration** | Not started | Multiple users on one derivation, Figma-style. Far future. |
| **Other domains** | Not started | V1 is single-variable calculus. Linear algebra, ODEs, chemistry — V2+. |

---

## 9. Troubleshooting

**The board says "Backend error: …"**
The Python server isn't running or returned an error. Check the terminal where you ran `uvicorn`. If the message is a SymPy parse error, your expression has a typo — SymPy syntax uses `**` for exponent (`x**2`, not `x^2`) and `*` for multiplication (`2*x`, not `2x`).

**The chips don't appear**
Either no active step yet (start with a Form A command) or `/suggest` failed. Check the network tab in the browser devtools.

**Nothing happens when I press Enter in the chat**
Make sure the input is focused and contains text. The Submit button is disabled while a request is pending.

**The frontend won't start**
Run `npm install` again. If it still fails, delete `node_modules` and `package-lock.json` and reinstall.

**Python install fails on pydantic**
You probably have Python 3.14+, which doesn't yet have prebuilt wheels for older pydantic versions. The current `requirements.txt` uses ranges (`>=`) so it should always pick a compatible version. If it still fails, install Python 3.12 or 3.13 via `py install 3.13`.

---

## 10. Where things live in the codebase

```
nabla/
├── apps/
│   ├── api/                       # FastAPI + SymPy
│   │   ├── main.py                # ALL the backend logic
│   │   ├── requirements.txt
│   │   └── README.md
│   └── web/                       # Next.js 15
│       ├── app/
│       │   ├── page.tsx           # the three-pane root + state machine
│       │   ├── layout.tsx
│       │   └── globals.css
│       ├── components/
│       │   ├── ChatPane.tsx
│       │   ├── BoardPane.tsx      # timeline, breadcrumb, active step
│       │   ├── ScratchPane.tsx
│       │   ├── Equation.tsx       # KaTeX renderer wrapper
│       │   └── SuggestChips.tsx
│       └── lib/
│           ├── api.ts             # POST /transform, /suggest
│           └── parse.ts           # regex command parser (replaced by LLM in V1)
└── docs/
    ├── ARCHITECTURE.md            # design decisions
    └── USAGE.md                   # this file
```

If you change `lib/parse.ts`, you're changing how user input is understood. If you change `apps/api/main.py`, you're changing what SymPy actually computes. Everything else is presentation.
