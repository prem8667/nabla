"use client";

import { useState } from "react";

export type ChatMessage =
  | { role: "user"; text: string }
  | { role: "system"; text: string; isError?: boolean };

export function ChatPane({
  messages,
  onSubmit,
  pending,
}: {
  messages: ChatMessage[];
  onSubmit: (text: string) => void;
  pending: boolean;
}) {
  const [draft, setDraft] = useState("");

  const submit = () => {
    const t = draft.trim();
    if (!t || pending) return;
    onSubmit(t);
    setDraft("");
  };

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--pane)" }}>
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
        <div className="text-sm font-semibold tracking-wide" style={{ color: "var(--text-dim)" }}>
          CHAT
        </div>
        <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
          v0 — command syntax
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 ? (
          <Hint />
        ) : (
          messages.map((m, i) => <Message key={i} m={m} />)
        )}
      </div>

      <div className="border-t p-3" style={{ borderColor: "var(--border)" }}>
        <textarea
          rows={3}
          placeholder="integrate x*sin(x) dx"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="w-full resize-none rounded-md px-3 py-2 font-mono text-sm outline-none"
          style={{
            background: "var(--pane-2)",
            border: "1px solid var(--border)",
            color: "var(--text)",
          }}
        />
        <div className="mt-2 flex items-center justify-between">
          <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>
            Enter to submit · Shift+Enter for newline
          </div>
          <button
            onClick={submit}
            disabled={pending || !draft.trim()}
            className="rounded-md px-3 py-1 text-sm font-medium disabled:opacity-40"
            style={{ background: "var(--accent-dim)", color: "var(--text)" }}
          >
            {pending ? "…" : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Message({ m }: { m: ChatMessage }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[85%] rounded-lg px-3 py-2 text-sm font-mono"
          style={{ background: "var(--accent-dim)", color: "var(--text)" }}
        >
          {m.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div
        className="max-w-[85%] rounded-lg px-3 py-2 text-sm"
        style={{
          background: "var(--pane-2)",
          color: m.isError ? "var(--error)" : "var(--text)",
          border: "1px solid var(--border)",
        }}
      >
        {m.text}
      </div>
    </div>
  );
}

function Hint() {
  const examples = [
    "integrate x*sin(x) dx",
    "d/dx exp(x)*x**2",
    "factor x**2 + 2*x*y + y**2",
    "simplify sin(x)**2 + cos(x)**2",
    "solve x**3 - 6*x**2 + 11*x - 6 for x",
  ];
  return (
    <div className="space-y-2">
      <div className="text-sm" style={{ color: "var(--text-dim)" }}>
        Try a command:
      </div>
      <div className="space-y-1">
        {examples.map((e) => (
          <div
            key={e}
            className="rounded-md px-3 py-2 font-mono text-xs"
            style={{ background: "var(--pane-2)", color: "var(--text)", border: "1px solid var(--border)" }}
          >
            {e}
          </div>
        ))}
      </div>
      <div className="pt-2 text-[11px] leading-relaxed" style={{ color: "var(--text-dim)" }}>
        V0 is command-based — V1 wires an LLM here so you can describe what you want in natural language.
      </div>
    </div>
  );
}
