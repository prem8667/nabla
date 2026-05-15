export type Op =
  | "integrate"
  | "diff"
  | "simplify"
  | "factor"
  | "expand"
  | "solve"
  | "limit"
  | "series"
  | "summation"
  | "trigsimp"
  | "apart"
  | "dsolve";

export type TransformRequest = {
  expr: string;
  op: Op;
  args?: Record<string, unknown>;
};

export type TransformResult = {
  input_latex: string;
  output_latex: string;
  output_sympy: string;
  op: string;
};

export type Suggestion = {
  op: Op;
  label: string;
  args?: Record<string, unknown>;
};

export type SuggestResponse = {
  suggestions: Suggestion[];
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatTurnRequest = {
  history: ChatMessage[];
  active_expr: string | null;
  active_op: string | null;
};

export type ChatTurnResponse = {
  kind: "transform" | "clarification" | "error";
  message: string;
  transform: TransformResult | null;
  expr_used: string | null;
  op_used: string | null;
  var_used: string | null;
};

export type LlmStatus = {
  configured: boolean;
  model: string | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    let detail = `HTTP ${r.status}`;
    try {
      const j = await r.json();
      if (j?.detail) detail = j.detail;
    } catch {}
    throw new Error(detail);
  }
  return r.json();
}

async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export type ExprPart = {
  kind: "term" | "factor" | "base" | "exponent" | "argument" | "atom";
  label: string;
  latex: string;
  sympy: string;
};

export type DecomposeResponse = {
  whole_latex: string;
  structure: "sum" | "product" | "power" | "function" | "equation" | "atomic";
  parts: ExprPart[];
};

export type ExplainPartResponse = {
  explanation: string;
};

export const transform = (req: TransformRequest) =>
  postJSON<TransformResult>("/transform", req);

export const suggest = (expr: string) =>
  postJSON<SuggestResponse>("/suggest", { expr });

export const chatTurn = (req: ChatTurnRequest) =>
  postJSON<ChatTurnResponse>("/chat-turn", req);

export const llmStatus = () => getJSON<LlmStatus>("/llm-status");

export const decompose = (expr: string) =>
  postJSON<DecomposeResponse>("/decompose", { expr });

export const explainPart = (whole: string, part: string) =>
  postJSON<ExplainPartResponse>("/explain-part", { whole, part });
