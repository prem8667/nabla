"use client";

import { Equation } from "./Equation";

export type Step = {
  id: string;
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
}: {
  steps: Step[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const active = steps.find((s) => s.id === activeId) ?? steps[steps.length - 1] ?? null;

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--pane)" }}>
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
        <div className="text-sm font-semibold tracking-wide" style={{ color: "var(--text-dim)" }}>
          BOARD
        </div>
        <Breadcrumb steps={steps} activeId={activeId} onSelect={onSelect} />
      </div>

      <div className="flex flex-1 overflow-hidden">
        <Timeline steps={steps} activeId={activeId ?? active?.id ?? null} onSelect={onSelect} />

        <div className="flex flex-1 items-center justify-center overflow-auto p-8">
          {!active ? <Empty /> : <ActiveStep step={active} />}
        </div>
      </div>
    </div>
  );
}

function ActiveStep({ step }: { step: Step }) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
        {step.op}
      </div>
      <div className="text-2xl">
        <Equation latex={step.inputLatex} />
      </div>
      <div style={{ color: "var(--text-dim)" }}>↓</div>
      <div className="text-3xl">
        <Equation latex={step.outputLatex} />
      </div>
      <div className="mt-4 text-xs font-mono" style={{ color: "var(--text-dim)" }}>
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
  return (
    <div
      className="flex w-14 flex-col items-center gap-2 overflow-y-auto border-r py-4"
      style={{ borderColor: "var(--border)", background: "var(--pane-2)" }}
    >
      {steps.map((s, i) => {
        const active = s.id === activeId;
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            title={s.pretty}
            className="relative flex h-10 w-10 items-center justify-center rounded-full text-xs font-mono"
            style={{
              background: active ? "var(--accent)" : "var(--pane)",
              color: active ? "#0b0d12" : "var(--text-dim)",
              border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
            }}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );
}

function Breadcrumb({
  steps,
  activeId,
  onSelect,
}: {
  steps: Step[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (steps.length === 0) return <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>no history</div>;
  return (
    <div className="flex max-w-[60%] items-center gap-1 overflow-x-auto text-[11px]" style={{ color: "var(--text-dim)" }}>
      {steps.map((s, i) => (
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
