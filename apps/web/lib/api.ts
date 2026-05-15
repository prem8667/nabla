export type Op = "integrate" | "diff" | "simplify" | "factor" | "expand" | "solve";

export type TransformRequest = {
  expr: string;
  op: Op;
  args?: Record<string, unknown>;
};

export type TransformResponse = {
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

export const transform = (req: TransformRequest) =>
  postJSON<TransformResponse>("/transform", req);

export const suggest = (expr: string) =>
  postJSON<SuggestResponse>("/suggest", { expr });
