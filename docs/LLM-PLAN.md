# LLM integration plan (V1)

This is the plan for the next big step: replacing the regex command parser with a real LLM that takes natural language.

---

## Which LLM

**Recommendation: Claude Sonnet 4.6 via the Anthropic API** (model id `claude-sonnet-4-6`).

### Why Claude

- **Best-in-class tool-calling reliability.** Our use case is "model emits a structured `TransformAction` JSON which SymPy then validates." This is exactly the workload Claude's tool use is designed for. Models that hallucinate tool arguments (a known weakness of cheaper open-source models) will break the SymPy validation step.
- **Long context window** (200K tokens) — useful when a session has lots of history and we want the LLM to consider the whole derivation graph.
- **Prompt caching** support — we can cache the system prompt and tool schemas once per session, cutting input token cost ~10x.
- **You already have a relationship with Anthropic** through Claude Code, so getting set up is quick.

### Pricing (as of mid-2026)

| Tier | Input | Output | What it means for Nabla |
|---|---|---|---|
| **Sonnet 4.6** | $3 / Mtok | $15 / Mtok | ~$0.005 per turn at typical sizes. Hundreds of test interactions for a few dollars. |
| Opus 4.7 | $15 / Mtok | $75 / Mtok | Overkill for V1. Switch only if Sonnet's tool-calling fails on hard derivations. |
| Haiku 4.5 | $1 / Mtok | $5 / Mtok | Tempting but tool-calling reliability is materially worse. Don't start here. |

### Alternatives (if you specifically don't want Anthropic)

| Provider | Model | Tool-calling | Notes |
|---|---|---|---|
| OpenAI | gpt-5-mini | Good | Cheaper than Sonnet; some reports of more verbose tool arguments. |
| OpenAI | gpt-5 | Excellent | Comparable to Sonnet; pricier. |
| Google | gemini-2.5-pro | Decent | Tool schema is different (no caching parity). |
| Groq + Llama 3.3 70B | OK | Variable | Fast and cheap but unpredictable on structured output. |

**Stick with Sonnet 4.6 unless you have a strong reason otherwise.**

---

## How the integration works

```
┌──────────┐  natural language    ┌─────────────┐
│ User     │ ──────────────────▶  │ ChatPane    │
│          │  "find the integral  │             │
│          │   of x times sin x"  │             │
└──────────┘                      └──────┬──────┘
                                         │
                                         │ POST /chat-turn
                                         │ { messages, current_step }
                                         ▼
                                  ┌─────────────┐
                                  │ Backend     │
                                  │  /chat-turn │
                                  └──────┬──────┘
                                         │
                                         │ Anthropic Messages API
                                         │   model: claude-sonnet-4-6
                                         │   tools: [TransformAction, AskClarification]
                                         │   system: "you are nabla, …"
                                         ▼
                                  ┌─────────────┐
                                  │ Claude      │
                                  │ Sonnet 4.6  │
                                  └──────┬──────┘
                                         │
                                         │ tool_use: TransformAction
                                         │   { op: "integrate",
                                         │     expr: "x*sin(x)",
                                         │     args: { var: "x" },
                                         │     explanation: "…" }
                                         ▼
                                  ┌─────────────┐
                                  │ Backend     │
                                  │ validates   │ ──── SymPy ────▶ runs the op
                                  │ via SymPy   │
                                  └──────┬──────┘
                                         │
                                         │ { new_step, llm_explanation }
                                         ▼
                                  ┌─────────────┐
                                  │ Frontend    │ ── render step + chat message
                                  └─────────────┘
```

### Two tools the LLM gets

1. **`TransformAction`** — the LLM's main move. Emits an op + args. The backend validates via SymPy. If valid, we add a step to the DAG.
2. **`AskClarification`** — when the user's input is ambiguous (e.g. "differentiate it" with no expression on the board). The LLM emits a question instead of an op; we render it as a chat message.

### System prompt sketch

The system prompt tells the model:
- It is Nabla, a math derivation assistant.
- The user is a researcher working through a derivation.
- The board has a current active expression (which we provide as context every turn).
- The model should emit a `TransformAction` tool call when the user wants an operation, with a short prose `explanation` field.
- The model should emit `AskClarification` only when the input genuinely cannot be turned into an action.
- The model should not narrate steps or do math itself — SymPy does the math. The model only **chooses** the move and **explains** it.

### Where the API key lives

For V1: **BYO key.** The user puts `ANTHROPIC_API_KEY=sk-ant-...` in `apps/api/.env`. The backend reads it via `python-dotenv` and passes it to the Anthropic SDK. The key never goes through the frontend.

Later (V1.5+) we can offer a hosted version with a shared key behind auth.

---

## What changes in the code

| File | Change |
|---|---|
| `apps/api/requirements.txt` | Add `anthropic`, `python-dotenv` |
| `apps/api/main.py` | Add `POST /chat-turn` endpoint. Defines tool schemas. Calls Anthropic Messages API. Validates returned tool calls via the existing `/transform` logic (refactored into a helper). |
| `apps/api/.env.example` | Add `ANTHROPIC_API_KEY=` |
| `apps/web/lib/api.ts` | Add `chatTurn(messages, currentStep)` client. |
| `apps/web/app/page.tsx` | Route chat input through `chatTurn` instead of `parseCommand`. Render the LLM's explanation as the assistant message. |
| `apps/web/lib/parse.ts` | Demoted to a fallback for when the LLM is unavailable (`ANTHROPIC_API_KEY` not set), so the app still works without a key. |

Estimated effort: ~2–3 hours including testing.

---

## What we test once it's in

| Scenario | Expected behaviour |
|---|---|
| "integrate x sin x with respect to x" | Tool call: `integrate(x*sin(x), x)`. Result on board. |
| "now differentiate that" | Tool call uses active step's output as `expr`. Chain extends. |
| "simplify" | Same — uses active output. |
| "what's the second derivative" | Two tool calls in a row, or one tool call with a chained op. We accept either. |
| "factor it as a polynomial in y" | Tool call with `op: factor`, expression is active output. |
| "did we get this right" | `AskClarification`-style response or a `simplify`/`expand` to verify. |
| User types gibberish | `AskClarification` asking what they meant. |
| API key missing | App falls back to the regex parser with a banner saying "LLM unavailable." |

---

## When to do it

The next commit, if you give the go-ahead. Everything in V0.1 was structural prep for exactly this — the DAG, the chips, the validated-by-SymPy contract — so this is the natural next step.
