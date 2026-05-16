"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { explainConcept, type ConceptResponse } from "@/lib/api";

/**
 * Recursive concept drill-down. Open it on any term or formula, then keep
 * clicking deeper sub-concepts until you hit bedrock — a primitive physical
 * quantity, a mathematical axiom, or a constant of nature.
 *
 * The breadcrumb at the top is the path from where you started down to where
 * you are now; click any crumb to climb back up.
 */
type Level = ConceptResponse & { loading?: boolean };

export function ConceptExplorer({
  rootConcept,
  contextFormula,
  onClose,
}: {
  rootConcept: string;
  contextFormula: string | null;
  onClose: () => void;
}) {
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  // Path of concept names that led to the current level (root first).
  const pathBefore = useCallback(
    (depth: number): string[] => {
      const ctx = contextFormula ? [contextFormula] : [];
      return [...ctx, ...levels.slice(0, depth).map((l) => l.concept)];
    },
    [levels, contextFormula],
  );

  const fetchLevel = useCallback(
    async (concept: string, depth: number) => {
      const myReq = ++reqId.current;
      setLoading(true);
      try {
        const res = await explainConcept(concept, pathBefore(depth));
        if (myReq !== reqId.current) return;
        setLevels((prev) => [...prev.slice(0, depth), res]);
      } catch (e) {
        if (myReq !== reqId.current) return;
        setLevels((prev) => [
          ...prev.slice(0, depth),
          {
            concept,
            explanation: e instanceof Error ? e.message : "Could not break this down.",
            subconcepts: [],
            is_fundamental: true,
          },
        ]);
      } finally {
        if (myReq === reqId.current) setLoading(false);
      }
    },
    [pathBefore],
  );

  // Load the root concept once on open.
  useEffect(() => {
    void fetchLevel(rootConcept, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootConcept]);

  const drill = (sub: string) => {
    if (loading) return;
    void fetchLevel(sub, levels.length);
  };

  const climbTo = (depth: number) => {
    if (loading || depth >= levels.length - 1) return;
    setLevels((prev) => prev.slice(0, depth + 1));
  };

  const current = levels[levels.length - 1] ?? null;

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center p-8"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-2xl flex-col rounded-xl p-5"
        style={{ background: "var(--pane)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold tracking-wide" style={{ color: "var(--text-dim)" }}>
            DRILL TO FUNDAMENTALS
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-0.5 text-xs"
            style={{ border: "1px solid var(--border)", color: "var(--text-dim)" }}
          >
            close
          </button>
        </div>

        {/* Breadcrumb — the path down. Click a crumb to climb back. */}
        <div className="mb-3 flex flex-wrap items-center gap-1 text-[11px]">
          {contextFormula ? (
            <span
              className="rounded px-2 py-0.5 font-mono"
              style={{ border: "1px solid var(--border)", color: "var(--text-dim)" }}
              title="the formula you started from"
            >
              {contextFormula}
            </span>
          ) : null}
          {levels.map((lv, i) => {
            const isLast = i === levels.length - 1;
            return (
              <span key={i} className="flex items-center gap-1">
                <span style={{ color: "var(--text-dim)" }}>›</span>
                <button
                  onClick={() => climbTo(i)}
                  disabled={isLast}
                  className="rounded px-2 py-0.5"
                  style={{
                    background: isLast ? "var(--accent-dim)" : "transparent",
                    color: isLast ? "var(--text)" : "var(--accent)",
                    border: "1px solid var(--border)",
                    cursor: isLast ? "default" : "pointer",
                  }}
                >
                  {lv.concept}
                </button>
              </span>
            );
          })}
        </div>

        {/* Current concept */}
        <div className="flex-1 overflow-y-auto">
          {!current && loading ? (
            <div className="text-sm" style={{ color: "var(--text-dim)" }}>
              breaking it down…
            </div>
          ) : current ? (
            <>
              <div className="mb-1 flex items-center gap-2">
                <div className="text-lg font-semibold">{current.concept}</div>
                {current.is_fundamental ? (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest"
                    style={{ background: "var(--accent-dim)", color: "var(--ok)" }}
                    title="cannot be reduced further"
                  >
                    ⊥ bedrock
                  </span>
                ) : null}
              </div>
              <div className="text-sm leading-relaxed" style={{ color: "var(--text)" }}>
                {current.explanation}
              </div>

              {current.is_fundamental ? (
                <div
                  className="mt-4 rounded-md px-3 py-2 text-xs"
                  style={{ background: "var(--pane-2)", border: "1px solid var(--border)", color: "var(--text-dim)" }}
                >
                  You've reached a fundamental concept — a primitive that isn't
                  defined in terms of anything more basic. This is bedrock. Climb
                  back up via the breadcrumb to explore a different branch.
                </div>
              ) : (
                <div className="mt-4">
                  <div
                    className="mb-2 text-[10px] uppercase tracking-widest"
                    style={{ color: "var(--text-dim)" }}
                  >
                    {loading ? "drilling…" : "what is this built from? — click to go deeper"}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {current.subconcepts.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => drill(s)}
                        disabled={loading}
                        className="rounded-md px-3 py-1.5 text-left text-sm disabled:opacity-40 hover:opacity-90"
                        style={{
                          background: "var(--pane-2)",
                          border: "1px solid var(--border)",
                          color: "var(--text)",
                        }}
                      >
                        ↓ {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        <div className="mt-3 text-[11px]" style={{ color: "var(--text-dim)" }}>
          Each step goes one level more fundamental. Keep going until you hit ⊥ bedrock.
        </div>
      </div>
    </div>
  );
}
