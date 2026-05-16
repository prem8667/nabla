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

---

## Commit 5 — V1: natural-language chat via Claude Sonnet 4.6

**The intent:** The structured commands (`integrate x*sin(x) dx`) worked but felt unnatural for a researcher who just wants to think out loud. This commit puts an LLM in the chat pane so you can type "find the integral of x times sin x" or "now differentiate that" — without losing the SymPy oracle that catches wrong moves.

**Backend (`apps/api/main.py`):**
- New endpoint `POST /chat-turn` that takes the conversation history plus the current board state and returns either a transform (with the SymPy result already computed) or a clarification question.
- Two tool definitions for Claude: `apply_transform` (op + optional expr + optional var + 1–2 sentence explanation) and `ask_clarification` (a question to send back to the user).
- Forced tool-use via `tool_choice={"type": "any"}` so Claude can never produce a plain-text reply — every turn is a structured action.
- Per-turn context injection: the active expression and its op are appended to the last user message so Claude knows what's on the board without polluting the cached system-prompt prefix.
- Prompt caching on the system prompt + tool schemas (`cache_control: ephemeral`) → ~10× cheaper input tokens after the first turn.
- Transform logic refactored into a shared `_apply_op` helper so `/transform`, `/suggest`, and `/chat-turn` all use the same SymPy code path.
- New endpoint `GET /llm-status` so the frontend can show whether the LLM is reachable.
- Graceful error handling: Anthropic API errors (credit exhausted, rate limits, network) are caught and returned as `kind: "error"` rather than HTTP failures.

**Frontend (`apps/web/`):**
- Chat now routes through `/chat-turn` first. If the LLM call errors out or the LLM emits an unparseable response, it automatically falls back to the V0.1 regex parser — so the app stays usable through credit exhaustion or network blips.
- `LLM on` / `LLM off` indicator at the top of the chat pane (with tooltip).
- Empty-state hints change based on LLM availability: natural-language examples when on, structured-command syntax when off.
- New assistant-role message style for Claude's prose explanations.
- Chat history sent to the API filters out red error messages — only real user/assistant turns become LLM context.

**Configuration:**
- `apps/api/.env.example` (committed) documents the two env vars: `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` (defaults to `claude-sonnet-4-6`).
- `apps/api/.env` (gitignored) holds the real key locally.
- `requirements.txt` gains `anthropic>=0.75.0` and `python-dotenv>=1.0.1`.

**Verified working:**
- "find the integral of x times sin x" → `integrate(x*sin(x), x)` → `-x*cos(x) + sin(x)` with a useful prose explanation.
- "now differentiate that" → uses the active output, applies `diff`, returns `x*sin(x)` — round-trips correctly.
- "factor this polynomial: x cubed minus six x squared plus eleven x minus six" → parses the words into `x**3 - 6*x**2 + 11*x - 6`, factors as `(x-3)(x-2)(x-1)`.
- "now find its roots" (with the factored form active) → `solve` returns `[1, 2, 3]`.
- "do something interesting" (empty board) → asks a clarifying question.
- Malformed input ("q@x{}") → Claude asks for clarification rather than passing junk to SymPy.

**What's intentionally left out:**
- Hover-history on individual terms (per-term provenance).
- Persistence: refresh still wipes the session.
- A visible streaming indicator while Claude is thinking (currently just "…" on the submit button).
- Multi-step plans: today Claude picks one move per turn. Multi-move plans (e.g. "do the integral and then simplify in one go") are left for V1.5.

---

---

## Commit 6 — V1.1: limit, series, summation + more decisive LLM

**The intent:** The first user session exposed two real bugs in V1: (1) Nabla didn't have enough ops to handle classic calculus derivations like Fermat's tangent method (which needs `limit`), and (2) the LLM kept asking "which function would you like?" instead of committing to a canonical example when the user named a method or technique.

**Backend (`apps/api/main.py`):**
- Three new ops in `_apply_op`:
  - `limit(expr, var, point, direction)` — args: `var`, `args.point`, `args.direction` (`+`/`-`/`+-`)
  - `series(expr, var, x0, n)` — args: `var`, `args.x0`, `args.n` (truncation order)
  - `summation(expr, (var, a, b))` — args: `var`, `args.from`, `args.to`
- Tool schema updated: op enum now has 9 entries; new optional `args` dict at the tool input level documents which keys go with which op.
- Backend merges top-level `var` from tool input with `args` dict so both styles work.
- System prompt rewritten with a "PREFER ACTION OVER QUESTIONS" section:
  - When the user names a method/technique without an expression, commit to a canonical example (Fermat's tangent method → diff on x², l'Hôpital's → limit of sin(x)/x, Taylor series → series on sin(x) at 0, geometric series → summation of x^n, partial fractions → integrate on 1/(x(x-1))).
  - "Asking which function would you like?" is almost always WORSE than picking one.
  - Use the `explanation` field to say which canonical example was picked.
- `/suggest` now offers Taylor series as a chip when the expression has trig or exp/log.

**Frontend (`apps/web/`):**
- `Op` union includes `limit`, `series`, `summation`.
- `prettifyPretty` in `page.tsx` and `prettify` in `lib/parse.ts` render the new ops as `lim x→? [ … ]`, `series( … ) at x=0`, `Σ … (x)`.

**Verified working:**
- `lim x→0 sin(x)/x = 1` (classic limit)
- Taylor series of `exp(x)` at 0, order 5 → `x⁴/24 + x³/6 + x²/2 + x + 1`
- `Σ 1/n² from n=1 to ∞ = π²/6` (Basel problem)
- Series chip appears for trig/exp/log expressions

**Caveat:**
- The LLM-level test for "Fermat's tangent method" couldn't run during this commit because the Anthropic credit balance was empty (the funded $10 hadn't applied yet, or the funding step in the console hadn't completed). All three new ops still work end-to-end via direct `/transform`, chips, and the regex fallback — only the natural-language path is currently affected, and only until credits land.

---

---

## Commit 7 — V1.2: LLM switched to OpenAI GPT-5 Mini

**The intent:** Anthropic credits ran out during testing. User provided an OpenAI key and asked to port the LLM path to GPT-5 Mini (cheaper, decent tool-calling for our schema).

**Backend (`apps/api/main.py`):**
- Replaced Anthropic SDK with OpenAI SDK.
- Tool schema rewritten in OpenAI's `{type: "function", function: {name, description, parameters}}` shape.
- System prompt moved into the messages array as a `{role: "system"}` message.
- Tool choice forced via `tool_choice="required"` (OpenAI's equivalent of Anthropic's `tool_choice={"type": "any"}`).
- `tool_calls` parsing: response shape is `resp.choices[0].message.tool_calls[i].function.arguments`, and `arguments` is a JSON string that needs `json.loads`.
- `max_completion_tokens=4096` (generous) because GPT-5 models burn reasoning tokens against this limit, even when the visible output is short. A small budget causes `finish_reason="length"` with empty content.
- Env vars renamed: `ANTHROPIC_API_KEY → OPENAI_API_KEY`, `ANTHROPIC_MODEL → OPENAI_MODEL` (default `gpt-5-mini`).
- `requirements.txt`: `anthropic` removed, `openai>=1.55.0` added.

**Frontend:** No changes. The wire format for `/chat-turn`, `/transform`, `/suggest`, and `/llm-status` is unchanged, so the frontend continues to work without recompilation.

**Verified working — full 19-case test suite:**
- All 9 direct ops (integrate, diff, simplify, factor, expand, solve, limit, series, summation) compute the correct SymPy result.
- `/suggest` returns the expected chips for polynomial and exp/log shapes.
- Natural-language fresh integral request → correct integrate.
- "Fermat's tangent method" → commits to `diff(x**2)`. (System prompt did its job.)
- "l'Hôpital's rule" → commits to `limit(sin(x)/x, x, 0)`.
- "Show me a Taylor series" → commits to `series(sin(x), x, 0)`.
- "Geometric series sum" → commits to `summation`.
- Chain: "now differentiate that" with active expression → diff round-trips back to the original.
- Natural-language limit: "limit of sin x over x as x approaches zero" → correct result `1`.
- Word-form factor: "factor x cubed minus six x squared plus eleven x minus six" → `(x-3)(x-2)(x-1)`.
- Malformed input "q@x{}" → LLM charitably reinterprets as `q(x)` and integrates symbolically, with an explanation that q is unspecified. Not a crash.

**Gotchas captured (in memory):**
- GPT-5 reasoning tokens: ALWAYS budget ≥1024 tokens for `max_completion_tokens` or short responses fail with `finish_reason="length"`.
- OpenAI tool format differs from Anthropic: `tools=[{type: "function", function: {...}}]` and arguments arrive as a JSON string, not parsed.

---

---

## Commit 8 — V1.3: persistence, welcome state, hover preview, branch connectors, +3 ops

**The intent:** Close every shipping gap from the mission/vision comparison except the per-term hover-history (which needs a serious SymPy step-by-step engine and is V2). This commit ships persistence, broader op coverage, the in-app welcome onboarding, hover previews on timeline nodes, and visible branch connectors.

**Backend (`apps/api/main.py`):**
- Three new ops: `trigsimp`, `apart`, `dsolve`.
  - `trigsimp(expr)` — trig-identity-aware simplification. Demonstrates: `sin²x + 2sin·cos + cos²x → sin(2x) + 1`.
  - `apart(expr, var)` — partial-fraction decomposition. Demonstrates: `(x+1)/((x-1)(x-2)) → -2/(x-1) + 3/(x-2)`.
  - `dsolve(expr=0, f(x))` — solves first-order ODEs in the form `expr=0` where the unknown is `f(x)`. Demonstrates: `f'(x) - f(x) = 0 → f(x) = C₁eˣ`.
- Op enum now contains 12 entries; system prompt documents each with arg shapes.

**Frontend (`apps/web/`):**
- **Session persistence (`lib/storage.ts`)** — versioned JSON snapshot of `{steps, activeId, messages, scratch}` in localStorage. Restored on mount, saved on every state change after restoration. A schema version field means future incompatible changes can ignore old saves instead of crashing.
- **"New session" button** in the chat-pane header. Confirms before clearing.
- **Lifted scratchpad state** to the root page so it persists with the rest of the session.
- **Welcome state on the empty board** — a real onboarding panel:
  - Big ∇ logo
  - "Welcome to Nabla" + one-line description
  - Three-step "How it works" card explaining the pane model
  - 4 clickable example cards that auto-submit (integration by parts, polynomial roots, l'Hôpital, trig identity)
  - LLM-off banner if the key isn't set, pointing at structured-command syntax
- **Hover preview** on timeline steps — when you hover any past step, a 18rem card pops in showing input → output, the LLM's explanation, and the timestamp. Disappears when the active step is hovered (no point previewing what you're already looking at).
- **Visual branch connectors** — the timeline now has a vertical spine line plus horizontal hairline stubs from spine to each step button. Forked branches get an accent-tinted connector. Tree shape is unambiguous instead of guessed-by-indent.
- **Active-step explanation rendering** — the LLM's prose explanation now shows below the equation on the board (not just in chat), so the board itself tells you what move was applied and why.
- New ops integrated into `Op` union, `prettifyPretty`, and the structured-command parser's prettify function.

**Verified — full 28-case test suite:**
- All 12 direct ops compute correct SymPy results.
- `/suggest` returns expected chips for polynomial and exp/log shapes.
- `/llm-status` reports OpenAI gpt-5-mini configured.
- 12 LLM scenarios pass, including:
  - Natural-language trig rewrite → LLM picks `trigsimp`.
  - "Decompose (x+1)/((x-1)(x-2)) using partial fractions" → LLM picks `apart`, correct result.
  - "Solve the ODE f prime of x equals f of x" → LLM picks `dsolve`, returns `f(x) = C₁eˣ`.

---

---

## Commit 9 — V1.4: term breakdown, step detail, equation morph

**The intent:** Close the last items from the mission comparison — "explain each part of the equation", "double-click to expand a step's internal history", and "equations morph as you discuss".

**Backend (`apps/api/main.py`):**
- `POST /decompose` — splits an expression into its top-level structural parts. Sums → addends, products → factors, powers → base + exponent, functions → arguments, equations → LHS + RHS. Returns each part's LaTeX, SymPy form, and a human label ("factor 2 of 3").
- `POST /explain-part` — takes the whole expression and one part; asks the LLM to explain that part's role in 1-2 sentences. Falls back to a structural description if the LLM is off.

**Frontend (`apps/web/`):**
- **`TermBreakdown` component** — under the active equation, shows the expression's parts as clickable chips (each rendered with KaTeX). Click a part → fetches an LLM explanation of what that part does and why it's there, shown inline. This is the "explain each part" piece of the vision.
- **`StepDetail` component** — double-clicking a timeline node opens a modal with the step's full internals: input → output equations, the op and its pretty form, the LLM's explanation, raw SymPy, lineage (which step it forked from), and timestamp.
- **Equation morph animation** — when a new active step lands, the board content animates in (fade + slight rise + scale). Respects `prefers-reduced-motion`. Keyed on the step id so it replays on every new step.
- Timeline rows now have a double-click handler and a "click to focus · double-click for detail" hint.

**Honest scope note:** This delivers the *user-facing value* of per-term inspection — you can click any part of the current equation and learn what it is. What it does NOT do is **cross-step provenance**: tracing that "this `sin(x)` came specifically from differentiating that `-cos(x)` two steps ago". True provenance needs a custom SymPy step-by-step engine that records every rewrite — a multi-day effort kept for V2. The `StepDetail` panel says so explicitly.

**Verified — 21-case suite (all PASS):**
- 12 direct ops still correct.
- `/decompose` splits sum (2 terms), product (3 factors), power (base+exponent) correctly.
- `/explain-part` returns a real LLM explanation.
- `/llm-status` healthy.
- Chat-turn: fresh integral, ODE → dsolve, partial fractions → apart, Fermat → commits.

---

---

## Commit 10 — V1.5: `show` op + recursive drill-to-fundamentals

**The intent:** First real usage exposed two gaps. (1) Typing "let's talk about E = mc²" made Nabla *differentiate* the formula — because every turn was forced to be a computation, there was no "just show me this formula" path. (2) The term breakdown explained a part but dead-ended — you couldn't keep asking "and what is THAT made of" down to first principles.

**Backend (`apps/api/main.py`):**
- New op **`show`** — returns the expression unchanged so a formula can be placed on the board for exploration rather than transformed. Parses in "display mode" where `E` and `I` (SymPy's Euler number / imaginary unit) are forced to plain symbols, so `E = mc²` reads as energy, not 2.718.
- System prompt gained a "DISPLAYING A FORMULA" section: when the user wants to look at / discuss / understand a formula, emit `op="show"`, never `diff`/`integrate`. Equations are written `Eq(lhs, rhs)`.
- New endpoint **`POST /explain-concept`** — the recursive drill-down engine. Takes a concept plus the drill-down path that led to it; returns an explanation, 2-4 *more fundamental* sub-concepts, and an `is_fundamental` flag. Uses an LLM tool call (`concept_breakdown`) for structured output. The system prompt instructs the model to move genuinely downward toward primitives and to flag bedrock — base physical quantities, math axioms, constants of nature.

**Frontend (`apps/web/`):**
- New **`ConceptExplorer`** overlay — the recursive drill-down UI:
  - Breadcrumb at the top showing the full path down (the formula → concept → sub-concept → …). Click any crumb to climb back up.
  - Current concept with its explanation.
  - Sub-concept chips — click to drill one level deeper.
  - A **⊥ bedrock** badge when a fundamental concept is reached; no deeper chips, with a note to climb back up via the breadcrumb.
- **`TermBreakdown` reworked** — each part chip now opens the ConceptExplorer rooted at that part (with the whole formula as drill context). A new "⌄ drill this to fundamentals" button opens the explorer rooted at the whole expression.
- `show` added to the `Op` union and `prettifyPretty`.

**Verified — 11-case suite (all PASS):**
- Core ops (integrate, diff, dsolve) still correct.
- `show` displays `E=mc²` and `F=ma` unchanged.
- The screenshot bug is fixed: "lets talk about e = mc square" now → `op=show`, not `diff`. "show me Newton's second law" → `op=show`, `Eq(F, m*a)`.
- `explain-concept`: "Energy" returns 4 sub-concepts, not fundamental. "time" at depth returns `is_fundamental=true`, no sub-concepts — it reached bedrock.
- 3-hop chain: kinetic energy → mass → (explained) — each hop goes deeper.

---

## What this gives you today

A workbench that is now *two tools in one*. As before, it transforms expressions with twelve symbolic ops. New in V1.5: it also **shows** formulas you just want to understand, and lets you **recursively drill any concept down to first principles** — E=mc² → energy → work → force → mass + acceleration → … → bedrock — with a breadcrumb to navigate the descent. The "learn how each thing works, all the way back to the fundamental" idea is now a real, working feature. Sessions persist, new users are onboarded, equations morph forward, branches are drawn. The one remaining V2 item is cross-step per-term provenance (which symbolic term came from which), which needs a dedicated SymPy step engine.
