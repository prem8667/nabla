# Nabla — V1 Architecture

This document captures the design decisions for V1 (calculus-only). It's a living document and will evolve as we build.

## Goals

- Three-pane workspace: chat, derivation board, scratchpad
- Derivation board is a **DAG of equation states**, not a linear scroll
- Every transformation is symbolically validated (SymPy is the oracle, not the LLM)
- Every node carries enough trace data to answer "why does this term exist?"
- Bidirectional navigation: see where the derivation came from AND where it could go

## The three panes

```
┌──────────────────┬─────────────────────────────────────┬──────────────────┐
│   CHAT           │   BOARD                             │   SCRATCH        │
│  (Vercel AI SDK) │  (tldraw + KaTeX/MathLive)          │  (tldraw, local) │
└──────────────────┴─────────────────────────────────────┴──────────────────┘
```

### Chat pane (left)

- React + streaming responses
- Each AI turn can include inline buttons (`[explain step]`, `[try a different method]`)
- The chat is conversational; the structured derivation lives on the board

### Board pane (middle)

The board has three layered components:

1. **Derivation canvas** — tldraw with custom equation-shapes. Each shape renders a step's input → output via KaTeX. Arrows connect parent → child.
2. **Timeline column** (left edge of board) — vertical git-style graph. Dots = states, lines = transformations, side branches = paths not taken. Click a dot to jump; right-click to fork.
3. **Future-moves chips** (under the active node) — always-visible chips for plausible next moves. Sourced from SymPy heuristics, reranked by the LLM.
4. **Breadcrumb strip** (top of board) — compact path from the original equation to the current node.

#### Per-step interactions

- **Hover any term** → tooltip with "what is this and where did it come from?"
- **Double-click any term** → expands the sub-history of just that term (a step within the step)
- **Click the step itself** → focus + show full LLM explanation in chat pane

### Scratch pane (right)

- Separate tldraw instance, local-only, not LLM-aware in V1
- Researchers use it for side-thoughts that shouldn't pollute the derivation
- V2+: optional "send selection to chat" so the LLM can read your scratch

## Data flow — one chat turn

```
1. User types in chat
                │
                ▼
2. Frontend sends { history, current_node_id, current_expr_MathJSON } ─▶ Backend
                                                                            │
                                  ┌─────────────────────────────────────────┤
                                  ▼                                         ▼
            3a. LLM (tool-calling)                        3b. SymPy "next-moves" heuristics
            Emits TransformAction:                        (only called on demand)
              { op: "integrate_by_parts",
                u: "x",
                dv: "sin(x) dx",
                explanation: "..." }
                                  │
                                  ▼
            4. Backend applies the transform with SymPy:
               - Convert MathJSON → SymPy expr
               - Run the operation (e.g. integrate_by_parts)
               - Validate result is symbolically equivalent (or strictly progressing)
               - Convert back to MathJSON
               - Compute branch options for the new state
                                  │
                                  ▼
5. Frontend receives { new_node, branches, explanation }
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        ▼                         ▼                         ▼
  Chat appends             Board adds new node       Future-moves chips
  explanation              + animates transition     refresh under new node
                           + extends timeline
```

## Data model

### Derivation node

```ts
type DerivationNode = {
  id: string;
  parentId: string | null;        // null = root
  expr: MathJSON;                  // the equation/expression at this state
  transform: TransformAction | null;  // how we got here from parent
  trace: TermTrace[];              // per-term provenance (for hover/double-click)
  explanation: string;             // LLM's prose
  createdAt: number;
};

type TransformAction = {
  op: string;                      // e.g. "integrate_by_parts", "u_substitution"
  args: Record<string, MathJSON>;  // op-specific arguments
  proposedBy: "llm" | "user" | "suggestion";
};

type TermTrace = {
  // Identifies a sub-expression in the new expr
  path: number[];                  // path into the MathJSON tree
  // Where it came from in the parent expr
  originPath: number[] | null;
  // One-line description for hover
  hoverText: string;
  // Full sub-history for double-click expansion
  subHistory: DerivationNode[];
};
```

### Derivation graph (the whole session)

```ts
type Session = {
  id: string;
  rootNodeId: string;
  nodes: Record<string, DerivationNode>;
  activeNodeId: string;
  scratchDoc: TldrawSnapshot;
};
```

## The two non-obvious design calls

**1. SymPy is the oracle, not the LLM.**
The LLM proposes the *move* and the *prose*; SymPy actually does the algebra and decides whether the result is valid. If SymPy disagrees with the LLM, the move is rejected and the chat shows the conflict. This is what makes Nabla a research tool rather than a tutor — wrong steps don't quietly slip through.

**2. Each board step is a node in a DAG, not a line in a list.**
Picking a different "next move" doesn't erase the current path — it forks. Going back to an earlier state and trying again creates a sibling. This is how researchers actually explore: trying things, abandoning them, comparing, returning.

## V1 cut

**Ships:**
- Single-variable calculus (∫, d/dx, limits, series)
- Chat-driven derivation with branch chips
- Hover + double-click history expansion
- Timeline column + breadcrumb strip
- Local-only scratchpad

**Doesn't ship (V2+):**
- Multi-variable / vector calculus / ODEs
- Linear algebra, chemistry, physics
- Scratchpad → LLM ("read my notes")
- Real-time collaboration
- Hand-drawn equation recognition
- Mobile / native apps

## Open questions

- **Whose Claude key?** V1 will likely be BYO-key (user provides their own Anthropic API key client-side). Hosted-key option later.
- **Persistence?** Local IndexedDB for V1 sessions; optional cloud sync as opt-in V2 feature.
- **Auth?** None for V1 — everything is client-side or single-user. Auth only matters once cloud sync exists.
