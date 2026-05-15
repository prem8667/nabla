# What's been built so far

A running log of the work, in plain English. Each section corresponds to a commit on `main`.

---

## Commit 1 — `0555bfc` · Initial commit: Nabla vision and V1 architecture

**The intent:** Stake out the project. No code yet — just enough to make the repo make sense to anyone who lands on it.

**Files added:**
- `README.md` — the public pitch. Explains the three-pane idea, what makes it different from existing tools (AI math chats, proof assistants, whiteboards), V1 scope, the stack.
- `LICENSE` — MIT, copyright Prem Kumar Rasakonda.
- `.gitignore` — Node, Python, secrets, Claude local settings.
- `docs/ARCHITECTURE.md` — the V1 design: three panes, DAG of derivation states, SymPy as oracle, data flow diagram, TypeScript schema for `DerivationNode`, the two non-obvious design calls.

**Why:** Public repos with vision docs are more trustworthy than empty ones. Anyone who finds the project from a search can immediately tell what we're building.

---

## Commit 2 — `d716a18` · V0 vertical slice: chat command → SymPy → board

**The intent:** Prove the loop works end-to-end with the smallest possible surface. No LLM, no DAG, no branches — just the bare path from a typed command to a rendered equation.

**Backend (`apps/api/`):**
- FastAPI app with a single endpoint: `POST /transform`.
- Six operations supported: `integrate`, `diff`, `simplify`, `factor`, `expand`, `solve`.
- SymPy does all the math. If parsing fails or an op throws, the API returns HTTP 400 with the error.
- CORS configured for `http://localhost:3000` so the frontend can call it.

**Frontend (`apps/web/`):**
- Next.js 15 + TypeScript + Tailwind + KaTeX.
- Three-pane layout: chat, board, scratch.
- The chat parses **structured commands** like `integrate x*sin(x) dx` or `solve x**2 - 4 for x` — no LLM yet, just regex.
- The board renders the input → output equation pair as KaTeX, and shows a vertical "timeline" of past steps as numbered dots on the left edge.
- The scratch pane is a plain textarea that doesn't touch the backend.

**Verified working:**
- `∫ x·sin(x) dx → sin(x) - x·cos(x)` (correct)
- `x² + 2xy + y² → (x+y)²` (factor)
- `sin²x + cos²x → 1` (simplify)
- `x³ - 6x² + 11x - 6 → [1, 2, 3]` (solve)
- `d/dx [x² eˣ] → x²eˣ + 2xeˣ` (diff)

**What was intentionally left out:**
- No LLM. The chat uses regex parsing.
- No DAG / branches. Steps form a linear list.
- No suggested next moves. You always type your next command.
- No hover-history on equation terms.

---

## Commit 3 — `a52347f` · V0.1: DAG branches, future-moves chips, op-only chaining

**The intent:** Make the workspace actually feel like a research lab. The V0 loop worked but you had to retype the full expression every time. This commit fixes that and adds the structural piece that makes branching possible.

**Backend (`apps/api/main.py`):**
- New endpoint `POST /suggest`. Takes an expression, returns 3–5 plausible next ops based on the expression's shape:
  - Polynomials get `factor`, `expand`, `solve`, `diff`, `integrate`.
  - Trig and exp/log expressions get `simplify` prominently.
  - Everything always gets `diff` and `integrate` w.r.t. its primary variable.
- Auto-detect "primary symbol" so you don't have to specify `var` every time. Prefers `x`, then `y`, `t`, `z`, then whatever symbol comes alphabetically first.

**Frontend (`apps/web/`):**
- `Step` data model now has `parentId`. Every step records which step it was derived from. The whole session is a tree (DAG), not a list.
- **Op-only commands** work now: typing `simplify` with no expression uses the active step's output. Typing `diff dy` uses the active output and differentiates w.r.t. `y`. This is how you chain a derivation forward without retyping.
- **Branching:** clicking an older step in the timeline and running a new op creates a **sibling branch** under that step. The original chain stays intact.
- **Tree timeline:** the left column now shows the steps as a depth-indented tree. Each button shows the 3-letter op name (`int`, `fac`, `sim` …) instead of just a number. Branched siblings get an accent border.
- **Ancestor breadcrumb:** the top bar shows the path from root → active step, not the flat list of all steps. So even in a branched DAG you can see "where am I right now."
- **Future-moves chips:** below the active equation, 3–5 clickable pills appear. Click any pill to apply that op to the current output. One-click chaining.
- **ChatPane hint** updated to show the two-form pattern (start with Form A, then Form B or chips).

**Verified working end-to-end:**
- Chain: `∫ x·sin(x) dx → -x·cos(x) + sin(x) → diff → x·sin(x)`. The derivation goes forward via a chip click and round-trips back to the original — proving the suggestion engine, the op-chaining, and SymPy round-trip all work.

**What was intentionally left out:**
- Still no LLM. The next commit will replace the regex parser with Claude Sonnet 4.6 tool-calling.
- Hover-history on individual terms (the "what is this part?" UX) is not built.
- Visual branch connectors (lines drawn between parent and child) are not drawn — only indentation hints at the tree.
- Session persistence: refresh wipes everything.

---

## What this gives you today

A working calculus workbench you can drive entirely with the chips and a starting command. The "research lab" feel — fork, compare, jump back — is there in a basic form. The thing that's missing for an outside user is being able to talk to it in natural language, which is what the next commit adds.
