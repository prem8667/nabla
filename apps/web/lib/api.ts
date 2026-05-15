export type TransformRequest = {
  expr: string;
  op: "integrate" | "diff" | "simplify" | "factor" | "expand" | "solve";
  args?: Record<string, unknown>;
};

export type TransformResponse = {
  input_latex: string;
  output_latex: string;
  output_sympy: string;
  op: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export async function transform(req: TransformRequest): Promise<TransformResponse> {
  const r = await fetch(`${API_BASE}/transform`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!r.ok) {
    let detail = `HTTP ${r.status}`;
    try {
      const body = await r.json();
      if (body?.detail) detail = body.detail;
    } catch {}
    throw new Error(detail);
  }
  return r.json();
}
