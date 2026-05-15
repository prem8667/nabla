"use client";

import type { Step } from "./BoardPane";
import { Equation } from "./Equation";

/**
 * The expanded internal view of one derivation step — what you get when you
 * double-click a node in the timeline. Shows the full input → output, the op,
 * the LLM's explanation, raw SymPy forms, and lineage.
 */
export function StepDetail({
  step,
  parent,
  index,
  onClose,
}: {
  step: Step;
  parent: Step | null;
  index: number;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center p-8"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl p-5"
        style={{ background: "var(--pane)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold tracking-wide" style={{ color: "var(--text-dim)" }}>
            STEP {index + 1} · {step.op.toUpperCase()}
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-0.5 text-xs"
            style={{ border: "1px solid var(--border)", color: "var(--text-dim)" }}
          >
            close
          </button>
        </div>

        <Row label="produced by">
          <span className="font-mono text-xs" style={{ color: "var(--text-dim)" }}>
            {step.pretty}
          </span>
        </Row>

        <Row label="input">
          <Equation latex={step.inputLatex} />
        </Row>

        <div className="my-2 text-center" style={{ color: "var(--text-dim)" }}>
          ↓ {step.op}
        </div>

        <Row label="output">
          <Equation latex={step.outputLatex} />
        </Row>

        {step.explanation ? (
          <Row label="why this move">
            <span className="text-sm leading-relaxed">{step.explanation}</span>
          </Row>
        ) : null}

        <Row label="raw sympy">
          <span className="font-mono text-xs" style={{ color: "var(--text-dim)" }}>
            {step.outputSympy}
          </span>
        </Row>

        <Row label="lineage">
          <span className="text-xs" style={{ color: "var(--text-dim)" }}>
            {parent
              ? `forked from step "${parent.op}" (${parent.outputSympy})`
              : "root step — start of this derivation branch"}
          </span>
        </Row>

        <Row label="created">
          <span className="text-xs" style={{ color: "var(--text-dim)" }}>
            {new Date(step.createdAt).toLocaleString()}
          </span>
        </Row>

        <div className="mt-3 text-[11px]" style={{ color: "var(--text-dim)" }}>
          Per-term derivation tracing (which term came from which) is a planned V2 feature —
          it needs a SymPy step-by-step engine.
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="mb-1 text-[10px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}
