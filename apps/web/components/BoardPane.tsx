"use client";

import type { Suggestion } from "@/lib/api";
import { Equation } from "./Equation";
import { SuggestChips } from "./SuggestChips";

export type Step = {
  id: string;
  parentId: string | null;
  inputLatex: string;
  outputLatex: string;
  outputSympy: string;
  op: string;
  pretty: string;
  createdAt: number;
};

export function BoardPane({
  steps,
  activeId,
  onSelect,
  suggestions,
  onPickSuggestion,
  pending,
}: {
  steps: Step[];
  activeId: string | null;
  onSelect: (id: string) => void;
  suggestions: Suggestion[];
  onPickSuggestion: (s: Suggestion) => void;
  pending: boolean;
}) {
  const active = steps.find((s) => s.id === activeId) ?? steps[steps.length - 1] ?? null;
  const ancestors = active ? ancestorPath(steps, active.id) : [];

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--pane)" }}>
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
        <div className="text-sm font-semibold tracking-wide" style={{ color: "var(--text-dim)" }}>
          BOARD
        </div>
        <Breadcrumb path={ancestors} activeId={active?.id ?? null} onSelect={onSelect} />
      </div>

      <div className="flex flex-1 overflow-hidden">
        <Timeline steps={steps} activeId={active?.id ?? null} onSelect={onSelect} />

        <div className="flex flex-1 items-center justify-center overflow-auto p-8">
          {!active ? (
            <Empty />
          ) : (
            <div className="flex flex-col items-center gap-6">
              <ActiveStep step={active} />
              <SuggestChips
                suggestions={suggestions}
                onPick={onPickSuggestion}
                pending={pending}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActiveStep({ step }: { step: Step }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
        {step.op}
      </div>
      <div className="text-xl opacity-70">
        <Equation latex={step.inputLatex} />
      </div>
      <div style={{ color: "var(--text-dim)" }}>↓</div>
      <div className="text-3xl">
        <Equation latex={step.outputLatex} />
      </div>
      <div className="mt-2 text-xs font-mono" style={{ color: "var(--text-dim)" }}>
        {step.outputSympy}
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="text-center" style={{ color: "var(--text-dim)" }}>
      <div className="text-6xl font-light" style={{ color: "var(--accent)" }}>
        ∇
      </div>
      <div className="mt-4 text-sm">The board is empty. Send a command from the chat to start.</div>
    </div>
  );
}

/** Walk parentIds from active back to root. */
function ancestorPath(steps: Step[], leafId: string): Step[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const out: Step[] = [];
  let cur: Step | undefined = byId.get(leafId);
  while (cur) {
    out.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out;
}

function Timeline({
  steps,
  activeId,
  onSelect,
}: {
  steps: Step[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (steps.length === 0) return null;

  const tree = buildTree(steps);

  return (
    <div
      className="flex w-20 flex-col items-center gap-1 overflow-y-auto border-r py-3"
      style={{ borderColor: "var(--border)", background: "var(--pane-2)" }}
    >
      {tree.map((row) => (
        <TimelineRow key={row.step.id} row={row} activeId={activeId} onSelect={onSelect} />
      ))}
    </div>
  );
}

type TreeRow = { step: Step; depth: number; siblingIndex: number };

function buildTree(steps: Step[]): TreeRow[] {
  // depth = distance from root; siblingIndex = nth child of its parent
  const childrenOf = new Map<string | null, Step[]>();
  for (const s of steps) {
    const arr = childrenOf.get(s.parentId) ?? [];
    arr.push(s);
    childrenOf.set(s.parentId, arr);
  }
  // sort each sibling group by creation time so older branches stay on the left
  childrenOf.forEach((arr) => arr.sort((a, b) => a.createdAt - b.createdAt));

  const rows: TreeRow[] = [];
  const walk = (parentId: string | null, depth: number) => {
    const kids = childrenOf.get(parentId) ?? [];
    kids.forEach((s, idx) => {
      rows.push({ step: s, depth, siblingIndex: idx });
      walk(s.id, depth + 1);
    });
  };
  walk(null, 0);
  return rows;
}

function TimelineRow({
  row,
  activeId,
  onSelect,
}: {
  row: TreeRow;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const { step, depth, siblingIndex } = row;
  const active = step.id === activeId;
  const branched = siblingIndex > 0;
  return (
    <button
      onClick={() => onSelect(step.id)}
      title={step.pretty}
      className="relative flex h-9 w-9 items-center justify-center rounded-full text-xs font-mono"
      style={{
        marginLeft: depth * 4,
        background: active ? "var(--accent)" : "var(--pane)",
        color: active ? "#0b0d12" : "var(--text-dim)",
        border: `1px solid ${active ? "var(--accent)" : branched ? "var(--accent-dim)" : "var(--border)"}`,
      }}
    >
      {step.op.slice(0, 3)}
    </button>
  );
}

function Breadcrumb({
  path,
  activeId,
  onSelect,
}: {
  path: Step[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (path.length === 0)
    return (
      <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
        no history
      </div>
    );
  return (
    <div className="flex max-w-[60%] items-center gap-1 overflow-x-auto text-[11px]" style={{ color: "var(--text-dim)" }}>
      {path.map((s, i) => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          className="rounded px-2 py-0.5 font-mono whitespace-nowrap"
          style={{
            background: s.id === activeId ? "var(--accent-dim)" : "transparent",
            color: s.id === activeId ? "var(--text)" : "var(--text-dim)",
            border: "1px solid var(--border)",
          }}
        >
          {i + 1} · {s.op}
        </button>
      ))}
    </div>
  );
}
