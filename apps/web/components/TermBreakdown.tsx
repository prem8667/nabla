"use client";

import { useEffect, useState } from "react";
import { decompose, type ExprPart } from "@/lib/api";
import { Equation } from "./Equation";

/**
 * Decomposes the active expression into its top-level parts. Each part — and
 * the whole expression — can be opened in the ConceptExplorer to drill
 * recursively down to first principles.
 */
export function TermBreakdown({
  sympyExpr,
  onExplore,
}: {
  sympyExpr: string;
  onExplore: (concept: string, contextFormula: string | null) => void;
}) {
  const [parts, setParts] = useState<ExprPart[]>([]);
  const [structure, setStructure] = useState<string>("atomic");

  useEffect(() => {
    let cancelled = false;
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

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-2">
      <button
        onClick={() => onExplore(sympyExpr, null)}
        className="rounded-full px-3 py-1 text-xs hover:opacity-90"
        style={{
          background: "var(--accent-dim)",
          border: "1px solid var(--accent)",
          color: "var(--text)",
        }}
        title="Recursively break this down to first principles"
      >
        ⌄ drill this to fundamentals
      </button>

      {parts.length > 0 ? (
        <>
          <div className="mt-1 text-[10px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
            parts of this {structure === "atomic" ? "expression" : structure} · click to explore
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {parts.map((p, i) => (
              <button
                key={i}
                onClick={() => onExplore(p.sympy, sympyExpr)}
                title={`${p.label} — click to drill down`}
                className="rounded-md px-3 py-1.5 hover:opacity-90"
                style={{ background: "var(--pane-2)", border: "1px solid var(--border)" }}
              >
                <Equation latex={p.latex} displayMode={false} />
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
