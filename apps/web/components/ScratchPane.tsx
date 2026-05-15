"use client";

import { useState } from "react";

export function ScratchPane() {
  const [value, setValue] = useState("");

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--pane)" }}>
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
        <div className="text-sm font-semibold tracking-wide" style={{ color: "var(--text-dim)" }}>
          SCRATCH
        </div>
        <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
          local only
        </div>
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="rough notes, scratch math, ideas you don't want in the main derivation…"
        className="flex-1 resize-none px-4 py-3 font-mono text-sm outline-none"
        style={{ background: "var(--pane)", color: "var(--text)" }}
      />
      <div className="border-t p-3 text-[11px]" style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}>
        V0 scratchpad is plain text and never sent to the AI. V2 adds freehand drawing + "send selection to chat."
      </div>
    </div>
  );
}
