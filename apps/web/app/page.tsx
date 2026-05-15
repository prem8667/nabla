"use client";

import { useCallback, useEffect, useState } from "react";
import { BoardPane, type Step } from "@/components/BoardPane";
import { ChatPane, type ChatMessage } from "@/components/ChatPane";
import { ScratchPane } from "@/components/ScratchPane";
import { suggest, transform, type Op, type Suggestion } from "@/lib/api";
import { parseCommand } from "@/lib/parse";

let _idCounter = 0;
const nextId = () => `s${++_idCounter}_${Date.now().toString(36)}`;

export default function Home() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const activeStep = steps.find((s) => s.id === activeId) ?? null;

  /** Refresh future-moves chips for the active step's output. */
  useEffect(() => {
    if (!activeStep) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    suggest(activeStep.outputSympy)
      .then((r) => {
        if (!cancelled) setSuggestions(r.suggestions);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeStep?.id, activeStep?.outputSympy]);

  const runTransform = useCallback(
    async (params: {
      op: Op;
      expr: string;
      args?: Record<string, unknown>;
      pretty: string;
      parentId: string | null;
      userMessage?: string;
    }) => {
      const { op, expr, args, pretty, parentId, userMessage } = params;
      if (userMessage) {
        setMessages((m) => [...m, { role: "user", text: userMessage }]);
      }
      setPending(true);
      try {
        const res = await transform({ op, expr, args });
        const step: Step = {
          id: nextId(),
          parentId,
          inputLatex: res.input_latex,
          outputLatex: res.output_latex,
          outputSympy: res.output_sympy,
          op: res.op,
          pretty,
          createdAt: Date.now(),
        };
        setSteps((prev) => [...prev, step]);
        setActiveId(step.id);
        setMessages((m) => [
          ...m,
          { role: "system", text: `${pretty}  =  ${res.output_sympy}` },
        ]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        setMessages((m) => [
          ...m,
          { role: "system", text: `Backend error: ${msg}`, isError: true },
        ]);
      } finally {
        setPending(false);
      }
    },
    [],
  );

  const handleSubmit = useCallback(
    async (raw: string) => {
      const parsed = parseCommand(raw);
      if (!parsed.ok) {
        setMessages((m) => [
          ...m,
          { role: "user", text: raw },
          { role: "system", text: parsed.error, isError: true },
        ]);
        return;
      }

      const explicitExpr = parsed.req.expr;
      const inputExpr = explicitExpr ?? activeStep?.outputSympy;
      if (!inputExpr) {
        setMessages((m) => [
          ...m,
          { role: "user", text: raw },
          {
            role: "system",
            text: `"${raw}" needs an expression. Either include one (e.g. simplify sin(x)**2 + cos(x)**2) or start with one first.`,
            isError: true,
          },
        ]);
        return;
      }

      const parentId = explicitExpr ? null : activeStep?.id ?? null;
      await runTransform({
        op: parsed.req.op,
        expr: inputExpr,
        args: parsed.req.args,
        pretty: parsed.pretty(inputExpr),
        parentId,
        userMessage: raw,
      });
    },
    [activeStep, runTransform],
  );

  const handlePickSuggestion = useCallback(
    async (s: Suggestion) => {
      if (!activeStep) return;
      const inputExpr = activeStep.outputSympy;
      const op = s.op;
      const args = s.args ?? {};
      const varName = (args["var"] as string | undefined) ?? "x";
      const pretty =
        op === "integrate"
          ? `∫ ${inputExpr} d${varName}`
          : op === "diff"
            ? `d/d${varName} [ ${inputExpr} ]`
            : op === "solve"
              ? `solve( ${inputExpr} = 0, ${varName} )`
              : `${op}( ${inputExpr} )`;

      await runTransform({
        op,
        expr: inputExpr,
        args,
        pretty,
        parentId: activeStep.id,
        userMessage: `→ ${s.label}`,
      });
    },
    [activeStep, runTransform],
  );

  return (
    <main className="grid h-screen w-screen grid-cols-[20rem_minmax(0,1fr)_18rem]">
      <ChatPane messages={messages} onSubmit={handleSubmit} pending={pending} />
      <div className="border-l border-r" style={{ borderColor: "var(--border)" }}>
        <BoardPane
          steps={steps}
          activeId={activeId}
          onSelect={setActiveId}
          suggestions={suggestions}
          onPickSuggestion={handlePickSuggestion}
          pending={pending}
        />
      </div>
      <ScratchPane />
    </main>
  );
}
