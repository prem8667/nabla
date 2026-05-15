"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BoardPane, type Step } from "@/components/BoardPane";
import { ChatPane, type ChatUiMessage } from "@/components/ChatPane";
import { ScratchPane } from "@/components/ScratchPane";
import {
  chatTurn,
  llmStatus,
  suggest,
  transform,
  type ChatMessage as WireChatMessage,
  type Op,
  type Suggestion,
} from "@/lib/api";
import { parseCommand } from "@/lib/parse";
import { clearSnapshot, loadSnapshot, saveSnapshot } from "@/lib/storage";

let _idCounter = 0;
const nextId = () => `s${++_idCounter}_${Date.now().toString(36)}`;

export default function Home() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatUiMessage[]>([]);
  const [scratch, setScratch] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [llmReady, setLlmReady] = useState<boolean | null>(null);
  const [restored, setRestored] = useState(false);

  const activeStep = steps.find((s) => s.id === activeId) ?? null;

  // ── Restore on mount, save on every relevant change ────────────────
  useEffect(() => {
    const snap = loadSnapshot();
    if (snap) {
      setSteps(snap.steps);
      setActiveId(snap.activeId);
      setMessages(snap.messages);
      setScratch(snap.scratch);
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    saveSnapshot({ steps, activeId, messages, scratch });
  }, [restored, steps, activeId, messages, scratch]);

  // ── LLM availability probe ──────────────────────────────────────────
  useEffect(() => {
    llmStatus()
      .then((s) => setLlmReady(s.configured))
      .catch(() => setLlmReady(false));
  }, []);

  // ── Refresh chips for the active step ──────────────────────────────
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

  // ── Core transform helpers ─────────────────────────────────────────
  const addStep = useCallback(
    (params: {
      op: string;
      pretty: string;
      explanation?: string;
      result: { input_latex: string; output_latex: string; output_sympy: string };
      parentId: string | null;
    }) => {
      const step: Step = {
        id: nextId(),
        parentId: params.parentId,
        inputLatex: params.result.input_latex,
        outputLatex: params.result.output_latex,
        outputSympy: params.result.output_sympy,
        op: params.op,
        pretty: params.pretty,
        explanation: params.explanation,
        createdAt: Date.now(),
      };
      setSteps((prev) => [...prev, step]);
      setActiveId(step.id);
      return step;
    },
    [],
  );

  const runDirectTransform = useCallback(
    async (params: {
      op: Op;
      expr: string;
      args?: Record<string, unknown>;
      pretty: string;
      parentId: string | null;
      explanation?: string;
    }) => {
      setPending(true);
      try {
        const res = await transform({ op: params.op, expr: params.expr, args: params.args });
        addStep({
          op: res.op,
          pretty: params.pretty,
          explanation: params.explanation,
          result: res,
          parentId: params.parentId,
        });
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text: params.explanation ?? `${params.pretty}  =  ${res.output_sympy}`,
          },
        ]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        setMessages((m) => [...m, { role: "system", text: `Backend error: ${msg}`, isError: true }]);
      } finally {
        setPending(false);
      }
    },
    [addStep],
  );

  const tryRegexFallback = useCallback(
    async (raw: string, useActive: Step | null): Promise<boolean> => {
      const parsed = parseCommand(raw);
      if (!parsed.ok) return false;
      const explicitExpr = parsed.req.expr;
      const inputExpr = explicitExpr ?? useActive?.outputSympy;
      if (!inputExpr) return false;
      const parentId = explicitExpr ? null : useActive?.id ?? null;
      await runDirectTransform({
        op: parsed.req.op,
        expr: inputExpr,
        args: parsed.req.args,
        pretty: parsed.pretty(inputExpr),
        parentId,
      });
      return true;
    },
    [runDirectTransform],
  );

  // Keep a ref to the latest values so handlers don't need to be re-bound on every keystroke
  const stateRef = useRef({ activeStep, messages, llmReady });
  stateRef.current = { activeStep, messages, llmReady };

  const handleSubmit = useCallback(
    async (raw: string) => {
      const { activeStep, messages, llmReady } = stateRef.current;
      setMessages((m) => [...m, { role: "user", text: raw }]);

      if (llmReady) {
        setPending(true);
        try {
          const history: WireChatMessage[] = [
            ...messages
              .filter((m) => m.role === "user" || m.role === "assistant")
              .map((m) => ({ role: m.role as "user" | "assistant", content: m.text })),
            { role: "user", content: raw },
          ];

          const res = await chatTurn({
            history,
            active_expr: activeStep?.outputSympy ?? null,
            active_op: activeStep?.op ?? null,
          });

          if (res.kind === "transform" && res.transform) {
            const op = res.op_used ?? res.transform.op;
            const expr = res.expr_used ?? "";
            const pretty = prettifyPretty(op, expr, res.var_used);
            const parentId =
              res.expr_used && res.expr_used !== activeStep?.outputSympy
                ? null
                : activeStep?.id ?? null;
            addStep({
              op: res.transform.op,
              pretty,
              explanation: res.message,
              result: res.transform,
              parentId,
            });
            setMessages((m) => [
              ...m,
              { role: "assistant", text: res.message || `${pretty}  =  ${res.transform!.output_sympy}` },
            ]);
            setPending(false);
            return;
          }

          if (res.kind === "clarification") {
            setMessages((m) => [...m, { role: "assistant", text: res.message }]);
            setPending(false);
            return;
          }

          setMessages((m) => [
            ...m,
            { role: "system", text: `LLM unavailable: ${res.message}. Trying structured-command parser…`, isError: true },
          ]);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          setMessages((m) => [
            ...m,
            { role: "system", text: `LLM call failed: ${msg}. Trying structured-command parser…`, isError: true },
          ]);
        } finally {
          setPending(false);
        }
      }

      const handled = await tryRegexFallback(raw, activeStep);
      if (!handled) {
        setMessages((m) => [
          ...m,
          {
            role: "system",
            text:
              `Couldn't understand "${raw}". ` +
              (llmReady
                ? "The LLM also couldn't handle it. Try rephrasing, or use a structured command (e.g. integrate x*sin(x) dx)."
                : "LLM is off. Use a structured command (e.g. integrate x*sin(x) dx)."),
            isError: true,
          },
        ]);
      }
    },
    [addStep, tryRegexFallback],
  );

  const handlePickSuggestion = useCallback(
    async (s: Suggestion) => {
      if (!activeStep) return;
      const inputExpr = activeStep.outputSympy;
      const args = s.args ?? {};
      const varName = (args["var"] as string | undefined) ?? "x";
      const pretty = prettifyPretty(s.op, inputExpr, varName);
      setMessages((m) => [...m, { role: "user", text: `→ ${s.label}` }]);
      await runDirectTransform({
        op: s.op,
        expr: inputExpr,
        args,
        pretty,
        parentId: activeStep.id,
      });
    },
    [activeStep, runDirectTransform],
  );

  const handleNewSession = useCallback(() => {
    if (steps.length > 0 || messages.length > 0 || scratch.length > 0) {
      const ok = window.confirm("Clear the current session? This deletes the timeline, chat, and scratch.");
      if (!ok) return;
    }
    clearSnapshot();
    setSteps([]);
    setActiveId(null);
    setMessages([]);
    setScratch("");
    setSuggestions([]);
  }, [steps.length, messages.length, scratch.length]);

  return (
    <main className="grid h-screen w-screen grid-cols-[20rem_minmax(0,1fr)_18rem]">
      <ChatPane
        messages={messages}
        onSubmit={handleSubmit}
        pending={pending}
        llmReady={llmReady}
        onNewSession={handleNewSession}
      />
      <div className="border-l border-r" style={{ borderColor: "var(--border)" }}>
        <BoardPane
          steps={steps}
          activeId={activeId}
          onSelect={setActiveId}
          suggestions={suggestions}
          onPickSuggestion={handlePickSuggestion}
          pending={pending}
          onSubmitExample={handleSubmit}
          llmReady={llmReady}
        />
      </div>
      <ScratchPane value={scratch} onChange={setScratch} />
    </main>
  );
}

function prettifyPretty(op: string, expr: string, varName: string | null | undefined): string {
  const sym = varName ?? "x";
  switch (op) {
    case "integrate":
      return `∫ ${expr} d${sym}`;
    case "diff":
      return `d/d${sym} [ ${expr} ]`;
    case "simplify":
      return `simplify( ${expr} )`;
    case "factor":
      return `factor( ${expr} )`;
    case "expand":
      return `expand( ${expr} )`;
    case "solve":
      return `solve( ${expr} = 0, ${sym} )`;
    case "limit":
      return `lim ${sym}→? [ ${expr} ]`;
    case "series":
      return `series( ${expr} )  at ${sym}=0`;
    case "summation":
      return `Σ ${expr}  (${sym})`;
    case "trigsimp":
      return `trigsimp( ${expr} )`;
    case "apart":
      return `apart( ${expr}, ${sym} )`;
    case "dsolve":
      return `dsolve( ${expr} )`;
    default:
      return `${op}( ${expr} )`;
  }
}
