"use client";

import { useState } from "react";

export type ChatUiMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string }
  | { role: "system"; text: string; isError?: boolean };

export function ChatPane({
  messages,
  onSubmit,
  pending,
  llmReady,
}: {
  messages: ChatUiMessage[];
  onSubmit: (text: string) => void;
  pending: boolean;
  llmReady: boolean | null;
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
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: "var(--border)" }}
      >
        <div
          className="text-sm font-semibold tracking-wide"
          style={{ color: "var(--text-dim)" }}
        >
          CHAT
        </div>
        <LlmIndicator status={llmReady} />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 ? (
          <Hint llmReady={llmReady} />
        ) : (
          messages.map((m, i) => <Message key={i} m={m} />)
        )}
      </div>

      <div
        className="border-t p-3"
        style={{ borderColor: "var(--border)" }}
      >
        <textarea
          rows={3}
          placeholder={
            llmReady
              ? "Ask anything — e.g. find the integral of x sin x"
              : "integrate x*sin(x) dx"
          }
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

function LlmIndicator({ status }: { status: boolean | null }) {
  if (status === null) {
    return (
      <div
        className="text-[10px] uppercase tracking-widest"
        style={{ color: "var(--text-dim)" }}
      >
        checking…
      </div>
    );
  }
  if (status === false) {
    return (
      <div
        className="text-[10px] uppercase tracking-widest"
        style={{ color: "var(--error)" }}
        title="ANTHROPIC_API_KEY not set — chat falls back to structured commands"
      >
        LLM off
      </div>
    );
  }
  return (
    <div
      className="text-[10px] uppercase tracking-widest"
      style={{ color: "var(--ok)" }}
      title="LLM connected — natural language works"
    >
      LLM on
    </div>
  );
}

function Message({ m }: { m: ChatUiMessage }) {
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
  if (m.role === "assistant") {
    return (
      <div className="flex justify-start">
        <div
          className="max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed"
          style={{
            background: "var(--pane-2)",
            color: "var(--text)",
            border: "1px solid var(--border)",
          }}
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
          color: m.isError ? "var(--error)" : "var(--text-dim)",
          border: "1px solid var(--border)",
        }}
      >
        {m.text}
      </div>
    </div>
  );
}

function Hint({ llmReady }: { llmReady: boolean | null }) {
  if (llmReady) {
    const examples = [
      "find the integral of x sin x",
      "what are the roots of x³ - 6x² + 11x - 6",
      "simplify sin²x + cos²x",
      "factor x² + 2xy + y²",
    ];
    const chain = [
      "find the integral of x exp(x)",
      "now differentiate it",
      "simplify",
    ];
    return (
      <div className="space-y-3">
        <div className="text-sm" style={{ color: "var(--text-dim)" }}>
          Ask in your own words:
        </div>
        <div className="space-y-1">
          {examples.map((e) => (
            <div
              key={e}
              className="rounded-md px-3 py-2 text-xs"
              style={{
                background: "var(--pane-2)",
                color: "var(--text)",
                border: "1px solid var(--border)",
              }}
            >
              {e}
            </div>
          ))}
        </div>
        <div className="space-y-1 pt-1">
          <div
            className="text-[11px] uppercase tracking-widest"
            style={{ color: "var(--text-dim)" }}
          >
            chain: refer to "that" or "it"
          </div>
          {chain.map((e, i) => (
            <div
              key={e}
              className="rounded-md px-3 py-2 text-xs"
              style={{
                background: "var(--pane-2)",
                color: "var(--text)",
                border: "1px solid var(--border)",
              }}
            >
              {i + 1}. {e}
            </div>
          ))}
        </div>
        <div
          className="pt-1 text-[11px] leading-relaxed"
          style={{ color: "var(--text-dim)" }}
        >
          Or click any chip under the board. Structured commands (
          <span className="font-mono">integrate x*sin(x) dx</span>) still work
          too — they're the offline fallback.
        </div>
      </div>
    );
  }

  // LLM off — show command syntax
  const examples = [
    "integrate x*sin(x) dx",
    "factor x**3 - x",
    "simplify sin(x)**2 + cos(x)**2",
    "solve x**2 - 5*x + 6 for x",
  ];
  return (
    <div className="space-y-3">
      <div className="text-sm" style={{ color: "var(--error)" }}>
        LLM is off (no ANTHROPIC_API_KEY). Use structured commands:
      </div>
      <div className="space-y-1">
        {examples.map((e) => (
          <div
            key={e}
            className="rounded-md px-3 py-2 font-mono text-xs"
            style={{
              background: "var(--pane-2)",
              color: "var(--text)",
              border: "1px solid var(--border)",
            }}
          >
            {e}
          </div>
        ))}
      </div>
    </div>
  );
}
