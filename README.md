# Nabla (∇)

> A research-lab whiteboard for math, in your browser.

Nabla is an interactive workspace where researchers, students, and curious minds work through derivations the way they do on a real whiteboard — not by scrolling a chat transcript, but by watching equations morph in place, tracing where each piece came from, and seeing where it could go next.

## The three-pane idea

```
┌──────────────────┬─────────────────────────────────────┬──────────────────┐
│   CHAT           │   BOARD                             │   SCRATCH        │
│                  │                                     │                  │
│  Talk to the AI  │  The live equation lives here.      │  Rough notes,    │
│  about what you  │  It morphs as you derive.           │  side-thoughts,  │
│  want to do.     │                                     │  freehand math.  │
│                  │  Hover any term → see its history.  │                  │
│                  │  Double-click → expand the full     │  Doesn't pollute │
│                  │  trace of how that part got there.  │  the derivation. │
│                  │                                     │                  │
│                  │  A timeline column shows every      │                  │
│                  │  past state. Branches show paths    │                  │
│                  │  you didn't take.                   │                  │
│                  │                                     │                  │
│                  │  Chips below the current step       │                  │
│                  │  show possible next moves.          │                  │
└──────────────────┴─────────────────────────────────────┴──────────────────┘
```

## What makes it different

Existing tools fall into three buckets, and none of them do the whole thing:

- **AI math chats** (ChatGPT, MathGPT) give you a linear scroll of text.
- **Proof assistants** (Lean, Coq, Paperproof) give you a structured derivation tree — but only for formal logic.
- **Whiteboards** (tldraw, Excalidraw, Whiteboard.chat) give you a canvas — but the equations are dumb text.

Nabla combines the three: a **structured derivation graph**, on a **live canvas**, driven by **AI chat**. Every step is a node. Every node remembers how it was produced. Every node knows what it could become.

## How it works

1. You type an equation or a question into chat.
2. The AI proposes a transformation. **SymPy validates it** — wrong moves get rejected, not narrated past.
3. The board animates the equation into its new form. The old state becomes a node in the timeline.
4. Click any term in the new equation → see why it's there. Double-click → expand the full sub-derivation.
5. Under the current step, chips show the next reasonable moves. Pick one, or ask the AI to suggest its own.
6. Every choice is a branch in the graph. Going "back" doesn't erase — it forks. You can compare paths side by side.

## V1 scope: calculus

We're starting with single-variable calculus (∫, d/dx, limits, series). It's a domain where:

- The "step" structure is naturally tree-shaped (chain rule, parts, substitution)
- SymPy already has mature step-by-step modules
- The UX wins are immediately obvious — anyone who's done a hard integral knows the value of seeing every move

Later domains (V2+): linear algebra, ODEs, chemistry equation balancing, classical mechanics derivations.

## Stack

| Layer | Choice |
|---|---|
| Equation rendering | [MathLive](https://cortexjs.io/mathlive/) + [KaTeX](https://katex.org/) |
| Canvas / board | [tldraw](https://tldraw.dev/) custom shapes |
| Symbolic engine | [SymPy](https://www.sympy.org/) (the source of truth) |
| LLM | Claude with tool-calling for structured transform actions |
| Frontend | Next.js + TypeScript |
| Backend | FastAPI + Python |
| Wire format | [MathJSON](https://cortexjs.io/math-json/) (AST shared between front and back) |

## Status

V0.1 — a working calculus workbench you can drive end-to-end with chips and structured commands. No LLM yet (that's V1, next up).

## Docs

- **[docs/USAGE.md](./docs/USAGE.md)** — how to run it, what every piece of the UI means, every command you can type, the data flow.
- **[docs/WHATS-BUILT.md](./docs/WHATS-BUILT.md)** — plain-English log of what each commit added.
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — design decisions and the V1 data model.
- **[docs/LLM-PLAN.md](./docs/LLM-PLAN.md)** — the plan for adding Claude Sonnet 4.6 in V1.

If the vision resonates and you want to help, open an issue or a discussion.

## License

MIT — see [LICENSE](./LICENSE).
