"use client";

import { useState } from "react";
import type { Suggestion } from "@/lib/api";
import { Equation } from "./Equation";
import { StepDetail } from "./StepDetail";
import { SuggestChips } from "./SuggestChips";
import { TermBreakdown } from "./TermBreakdown";

export type Step = {
  id: string;
  parentId: string | null;
  inputLatex: string;
  outputLatex: string;
  outputSympy: string;
  op: string;
  pretty: string;
  createdAt: number;
  explanation?: string;
};

const WELCOME_EXAMPLES = [
  { label: "Integration by parts", text: "find the integral of x times sin x" },
  { label: "Polynomial roots", text: "solve x cubed minus 6 x squared plus 11 x minus 6 for x" },
  { label: "l'Hôpital's rule", text: "what is the limit of sin x over x as x approaches zero" },
  { label: "Trig identity", text: "simplify sin x squared plus cos x squared" },
];

export function BoardPane({
  steps,
  activeId,
  onSelect,
  suggestions,
  onPickSuggestion,
  pending,
  onSubmitExample,
  llmReady,
}: {
  steps: Step[];
  activeId: string | null;
  onSelect: (id: string) => void;
  suggestions: Suggestion[];
  onPickSuggestion: (s: Suggestion) => void;
  pending: boolean;
  onSubmitExample: (text: string) => void;
  llmReady: boolean | null;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const active = steps.find((s) => s.id === activeId) ?? steps[steps.length - 1] ?? null;
  const ancestors = active ? ancestorPath(steps, active.id) : [];
  const hovered = hoveredId ? steps.find((s) => s.id === hoveredId) ?? null : null;
  const detailStep = detailId ? steps.find((s) => s.id === detailId) ?? null : null;
  const detailIndex = detailStep ? steps.findIndex((s) => s.id === detailStep.id) : -1;
  const detailParent = detailStep?.parentId
    ? steps.find((s) => s.id === detailStep.parentId) ?? null
    : null;

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--pane)" }}>
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
        <div className="text-sm font-semibold tracking-wide" style={{ color: "var(--text-dim)" }}>
          BOARD
        </div>
        <Breadcrumb path={ancestors} activeId={active?.id ?? null} onSelect={onSelect} />
      </div>

      <div className="relative flex flex-1 overflow-hidden">
        <Timeline
          steps={steps}
          activeId={active?.id ?? null}
          hoveredId={hoveredId}
          onSelect={onSelect}
          onHover={setHoveredId}
          onOpenDetail={setDetailId}
        />

        <div className="flex flex-1 items-center justify-center overflow-auto p-8">
          {!active ? (
            <Welcome onPick={onSubmitExample} pending={pending} llmReady={llmReady} />
          ) : (
            <div key={active.id} className="nabla-morph flex flex-col items-center gap-6">
              <ActiveStep step={active} />
              <SuggestChips
                suggestions={suggestions}
                onPick={onPickSuggestion}
                pending={pending}
              />
              <TermBreakdown sympyExpr={active.outputSympy} />
            </div>
          )}
        </div>

        {hovered && hovered.id !== active?.id ? <HoverPreview step={hovered} /> : null}

        {detailStep ? (
          <StepDetail
            step={detailStep}
            parent={detailParent}
            index={detailIndex}
            onClose={() => setDetailId(null)}
          />
        ) : null}
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
      {step.explanation ? (
        <div
          className="mt-2 max-w-xl text-sm leading-relaxed"
          style={{ color: "var(--text-dim)" }}
        >
          {step.explanation}
        </div>
      ) : null}
      <div className="mt-1 text-xs font-mono" style={{ color: "var(--text-dim)" }}>
        {step.outputSympy}
      </div>
    </div>
  );
}

function Welcome({
  onPick,
  pending,
  llmReady,
}: {
  onPick: (text: string) => void;
  pending: boolean;
  llmReady: boolean | null;
}) {
  return (
    <div className="flex max-w-2xl flex-col items-center gap-6 text-center">
      <div className="text-7xl font-light" style={{ color: "var(--accent)" }}>
        ∇
      </div>
      <div>
        <div className="text-2xl font-semibold">Welcome to Nabla</div>
        <div className="mt-1 text-sm" style={{ color: "var(--text-dim)" }}>
          A whiteboard for math derivations. Chat on the left, the live equation here, scratch on the right.
        </div>
      </div>

      <div
        className="w-full rounded-lg p-4 text-left text-xs leading-relaxed"
        style={{
          background: "var(--pane-2)",
          border: "1px solid var(--border)",
          color: "var(--text-dim)",
        }}
      >
        <div className="mb-2 text-[10px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
          How it works
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="font-semibold" style={{ color: "var(--text)" }}>1. Type or click</div>
            <div className="mt-1">Pick an example below or write what you want to compute.</div>
          </div>
          <div>
            <div className="font-semibold" style={{ color: "var(--text)" }}>2. Watch the board</div>
            <div className="mt-1">Each move adds a step. Past states stay in the timeline on the left.</div>
          </div>
          <div>
            <div className="font-semibold" style={{ color: "var(--text)" }}>3. Chain or branch</div>
            <div className="mt-1">Click a chip to apply, or click an old step to fork a new path.</div>
          </div>
        </div>
      </div>

      <div className="w-full">
        <div
          className="mb-2 text-[10px] uppercase tracking-widest"
          style={{ color: "var(--text-dim)" }}
        >
          start with an example
        </div>
        <div className="grid grid-cols-2 gap-2">
          {WELCOME_EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              disabled={pending}
              onClick={() => onPick(ex.text)}
              className="rounded-md p-3 text-left text-sm disabled:opacity-40 hover:opacity-90"
              style={{
                background: "var(--pane-2)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            >
              <div className="text-xs uppercase tracking-widest" style={{ color: "var(--accent)" }}>
                {ex.label}
              </div>
              <div className="mt-1 font-mono text-[11px]" style={{ color: "var(--text-dim)" }}>
                {ex.text}
              </div>
            </button>
          ))}
        </div>
      </div>

      {llmReady === false ? (
        <div
          className="rounded-md px-3 py-2 text-xs"
          style={{
            background: "var(--pane-2)",
            border: "1px solid var(--border)",
            color: "var(--error)",
          }}
        >
          LLM is off. These examples need natural-language input — use structured commands like{" "}
          <span className="font-mono">integrate x*sin(x) dx</span> in the chat.
        </div>
      ) : null}
    </div>
  );
}

function HoverPreview({ step }: { step: Step }) {
  return (
    <div
      className="pointer-events-none absolute left-24 top-4 w-72 rounded-lg p-3 shadow-2xl"
      style={{
        background: "var(--pane-2)",
        border: "1px solid var(--border)",
        zIndex: 20,
      }}
    >
      <div
        className="mb-2 text-[10px] uppercase tracking-widest"
        style={{ color: "var(--text-dim)" }}
      >
        {step.op} · {new Date(step.createdAt).toLocaleTimeString()}
      </div>
      <div className="text-sm opacity-70">
        <Equation latex={step.inputLatex} />
      </div>
      <div className="my-1 text-center text-xs" style={{ color: "var(--text-dim)" }}>
        ↓
      </div>
      <div className="text-base">
        <Equation latex={step.outputLatex} />
      </div>
      {step.explanation ? (
        <div className="mt-2 text-[11px] leading-snug" style={{ color: "var(--text-dim)" }}>
          {step.explanation}
        </div>
      ) : null}
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
  hoveredId,
  onSelect,
  onHover,
  onOpenDetail,
}: {
  steps: Step[];
  activeId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onOpenDetail: (id: string) => void;
}) {
  if (steps.length === 0) return null;
  const tree = buildTree(steps);
  return (
    <div
      className="relative flex w-20 flex-col items-stretch overflow-y-auto border-r py-3"
      style={{ borderColor: "var(--border)", background: "var(--pane-2)" }}
    >
      <div
        className="pointer-events-none absolute bottom-0 left-[1.1rem] top-0 w-px"
        style={{ background: "var(--border)" }}
      />
      {tree.map((row, i) => (
        <TimelineRow
          key={row.step.id}
          row={row}
          previousDepth={i > 0 ? tree[i - 1].depth : 0}
          activeId={activeId}
          hoveredId={hoveredId}
          onSelect={onSelect}
          onHover={onHover}
          onOpenDetail={onOpenDetail}
        />
      ))}
      <div className="mt-2 px-2 text-center text-[9px] leading-tight" style={{ color: "var(--text-dim)" }}>
        click to focus · double-click for detail
      </div>
    </div>
  );
}

type TreeRow = { step: Step; depth: number; siblingIndex: number };

function buildTree(steps: Step[]): TreeRow[] {
  const childrenOf = new Map<string | null, Step[]>();
  for (const s of steps) {
    const arr = childrenOf.get(s.parentId) ?? [];
    arr.push(s);
    childrenOf.set(s.parentId, arr);
  }
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
  previousDepth,
  activeId,
  hoveredId,
  onSelect,
  onHover,
  onOpenDetail,
}: {
  row: TreeRow;
  previousDepth: number;
  activeId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onOpenDetail: (id: string) => void;
}) {
  const { step, depth, siblingIndex } = row;
  const active = step.id === activeId;
  const hovered = step.id === hoveredId;
  const branched = siblingIndex > 0;

  return (
    <div className="relative my-0.5 flex items-center pr-1" style={{ paddingLeft: depth * 8 + 4 }}>
      {/* Horizontal stub from spine to button */}
      {depth > 0 ? (
        <span
          aria-hidden
          className="absolute h-px"
          style={{
            left: "1.1rem",
            width: `${Math.max(0, depth * 8 - 4)}px`,
            top: "50%",
            background: branched ? "var(--accent-dim)" : "var(--border)",
          }}
        />
      ) : null}
      <button
        onClick={() => onSelect(step.id)}
        onDoubleClick={() => onOpenDetail(step.id)}
        onMouseEnter={() => onHover(step.id)}
        onMouseLeave={() => onHover(null)}
        title={`${step.pretty}  —  double-click for detail`}
        className="relative flex h-8 min-w-[2.25rem] items-center justify-center rounded-full px-2 text-[10px] font-mono"
        style={{
          background: active
            ? "var(--accent)"
            : hovered
              ? "var(--pane)"
              : "var(--pane-2)",
          color: active ? "#0b0d12" : "var(--text-dim)",
          border: `1px solid ${active ? "var(--accent)" : branched ? "var(--accent-dim)" : "var(--border)"}`,
        }}
      >
        {step.op.slice(0, 3)}
      </button>
    </div>
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
