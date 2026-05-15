"use client";

import { useEffect, useState } from "react";
import { decompose, explainPart, type ExprPart } from "@/lib/api";
import { Equation } from "./Equation";

/**
 * Decomposes the active expression into its top-level parts and lets the
 * user click any part to get an LLM explanation of its role.
 *
 * This is the "explain each part of the equation" piece of the vision.
 * It is part-level, not arbitrary-sub-term-level — true per-term provenance
 * across steps needs a SymPy step-by-step engine (a V2 effort).
 */
export function TermBreakdown({ sympyExpr }: { sympyExpr: string }) {
  const [parts, setParts] = useState<ExprPart[]>([]);
  const [structure, setStructure] = useState<string>("atomic");
  const [selected, setSelected] = useState<number | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loadingExplain, setLoadingExplain] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSelected(null);
    setExplanation(null);
    decompose(sympyExpr)
      .then((r) => {
        if (cancelled) return;
        setParts(r.parts);
        setStructure(r.structure);
      })
      .catch(() => {
        if (cancelled) return;
        setParts([]);
        setStructure("atomic");
      });
    return () => {
      cancelled = true;
    };
  }, [sympyExpr]);

  if (parts.length === 0) return null;

  const pickPart = async (idx: number) => {
    setSelected(idx);
    setExplanation(null);
    setLoadingExplain(true);
    try {
      const r = await explainPart(sympyExpr, parts[idx].sympy);
      setExplanation(r.explanation);
    } catch (e) {
      setExplanation(e instanceof Error ? e.message : "Could not explain this part.");
    } finally {
      setLoadingExplain(false);
    }
  };

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-2">
      <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
        parts of this {structure === "atomic" ? "expression" : structure} · click to explain
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {parts.map((p, i) => (
          <button
            key={i}
            onClick={() => pickPart(i)}
            title={p.label}
            className="rounded-md px-3 py-1.5"
            style={{
              background: selected === i ? "var(--accent-dim)" : "var(--pane-2)",
              border: `1px solid ${selected === i ? "var(--accent)" : "var(--border)"}`,
            }}
          >
            <Equation latex={p.latex} displayMode={false} />
          </button>
        ))}
      </div>
      {selected !== null ? (
        <div
          className="mt-1 w-full rounded-md px-3 py-2 text-sm leading-relaxed"
          style={{
            background: "var(--pane-2)",
            border: "1px solid var(--border)",
            color: "var(--text)",
          }}
        >
          <div className="mb-1 text-[10px] uppercase tracking-widest" style={{ color: "var(--accent)" }}>
            {parts[selected].label}
          </div>
          {loadingExplain ? (
            <span style={{ color: "var(--text-dim)" }}>explaining…</span>
          ) : (
            explanation
          )}
        </div>
      ) : null}
    </div>
  );
}
