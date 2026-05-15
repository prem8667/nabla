"use client";

import { useState } from "react";
import { BoardPane, type Step } from "@/components/BoardPane";
import { ChatPane, type ChatMessage } from "@/components/ChatPane";
import { ScratchPane } from "@/components/ScratchPane";
import { transform } from "@/lib/api";
import { parseCommand } from "@/lib/parse";

let _idCounter = 0;
const nextId = () => `s${++_idCounter}_${Date.now().toString(36)}`;

export default function Home() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (raw: string) => {
    setMessages((m) => [...m, { role: "user", text: raw }]);

    const parsed = parseCommand(raw);
    if (!parsed.ok) {
      setMessages((m) => [...m, { role: "system", text: parsed.error, isError: true }]);
      return;
    }

    setPending(true);
    try {
      const res = await transform(parsed.req);
      const step: Step = {
        id: nextId(),
        inputLatex: res.input_latex,
        outputLatex: res.output_latex,
        outputSympy: res.output_sympy,
        op: res.op,
        pretty: parsed.pretty,
        createdAt: Date.now(),
      };
      setSteps((prev) => [...prev, step]);
      setActiveId(step.id);
      setMessages((m) => [
        ...m,
        { role: "system", text: `${parsed.pretty}  =  ${res.output_sympy}` },
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
  };

  return (
    <main className="grid h-screen w-screen grid-cols-[20rem_minmax(0,1fr)_18rem]">
      <ChatPane messages={messages} onSubmit={handleSubmit} pending={pending} />
      <div className="border-l border-r" style={{ borderColor: "var(--border)" }}>
        <BoardPane steps={steps} activeId={activeId} onSelect={setActiveId} />
      </div>
      <ScratchPane />
    </main>
  );
}
