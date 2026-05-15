"use client";

import type { Suggestion } from "@/lib/api";

export function SuggestChips({
  suggestions,
  onPick,
  pending,
}: {
  suggestions: Suggestion[];
  onPick: (s: Suggestion) => void;
  pending: boolean;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div className="flex flex-col items-center gap-2 pt-2">
      <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
        possible next moves
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {suggestions.map((s, i) => (
          <button
            key={i}
            disabled={pending}
            onClick={() => onPick(s)}
            className="rounded-full px-3 py-1 text-xs disabled:opacity-40 hover:opacity-80"
            style={{
              background: "var(--pane-2)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
