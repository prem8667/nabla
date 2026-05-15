import type { Op, TransformRequest } from "./api";

/**
 * V0.1 parser: turn free-form chat input into a TransformRequest.
 *
 * Two forms:
 *   1. "<op> <expr> [dx | for x | ...]"  — uses the provided expression
 *   2. "<op> [dx | for x | ...]"          — op-only; uses the *active step's
 *                                            output* as the expression. This is
 *                                            how a derivation chains forward.
 *
 * Examples:
 *   integrate x*sin(x) dx     (form 1)
 *   simplify                  (form 2 — operates on active output)
 *   factor                    (form 2)
 *   diff dy                   (form 2 — diff w.r.t. y)
 *   solve for x               (form 2)
 *
 * If no pattern matches, returns { error }.
 */
export type ParseResult =
  | { ok: true; req: Omit<TransformRequest, "expr"> & { expr?: string }; pretty: (e: string) => string }
  | { ok: false; error: string };

const trimDx = (s: string): { expr: string; var: string | undefined } => {
  const m = s.match(/^(.*?)\s*d\s*([a-zA-Z])\s*$/);
  if (m) return { expr: m[1].trim(), var: m[2] };
  return { expr: s.trim(), var: undefined };
};

const trimForVar = (s: string): { expr: string; var: string | undefined } => {
  const m = s.match(/^(.*?)\s+for\s+([a-zA-Z])\s*$/i);
  if (m) return { expr: m[1].trim(), var: m[2] };
  return { expr: s.trim(), var: undefined };
};

/** Strip a trailing "d<var>" or "for <var>" with no preceding expr. */
const trailingVar = (s: string): string | undefined => {
  let m = s.match(/^d\s*([a-zA-Z])\s*$/);
  if (m) return m[1];
  m = s.match(/^for\s+([a-zA-Z])\s*$/i);
  if (m) return m[1];
  return undefined;
};

function makeOpReq(
  op: Op,
  exprPart: string | undefined,
  varName: string | undefined,
): ParseResult {
  const args: Record<string, unknown> = {};
  if (varName) args.var = varName;
  return {
    ok: true,
    req: exprPart ? { expr: exprPart, op, args } : { op, args },
    pretty: (e) => prettify(op, e, varName),
  };
}

function prettify(op: Op, expr: string, v: string | undefined): string {
  const sym = v ?? "x";
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
  }
}

export function parseCommand(raw: string): ParseResult {
  const input = raw.trim();
  if (!input) return { ok: false, error: "empty input" };

  // d/dx <expr>
  let m = input.match(/^d\/d([a-zA-Z])\s+(.+)$/i);
  if (m) return makeOpReq("diff", m[2].trim(), m[1]);

  // d/dx alone -> diff with var, expr from active
  m = input.match(/^d\/d([a-zA-Z])\s*$/i);
  if (m) return makeOpReq("diff", undefined, m[1]);

  // <op> <rest?>
  const opMatch = input.match(/^(integrate|∫|int|diff|derivative|simplify|factor|expand|solve)\b\s*(.*)$/i);
  if (opMatch) {
    const opWord = opMatch[1].toLowerCase();
    const rest = opMatch[2].trim();

    const op: Op =
      opWord === "∫" || opWord === "int" || opWord === "integrate"
        ? "integrate"
        : opWord === "diff" || opWord === "derivative"
          ? "diff"
          : (opWord as Op);

    if (!rest) {
      // op alone — apply to active output
      return makeOpReq(op, undefined, undefined);
    }

    // op + rest — does rest contain just a var directive ("dx", "for x") with no expression?
    const onlyVar = trailingVar(rest);
    if (onlyVar) return makeOpReq(op, undefined, onlyVar);

    // op + expression (+ trailing var hint)
    if (op === "integrate" || op === "diff") {
      const { expr, var: v } = trimDx(rest);
      if (!expr) return { ok: false, error: `missing expression after ${op}` };
      return makeOpReq(op, expr, v);
    }
    if (op === "solve") {
      const { expr, var: v } = trimForVar(rest);
      if (!expr) return { ok: false, error: "missing expression after solve" };
      return makeOpReq(op, expr, v);
    }
    // simplify / factor / expand
    return makeOpReq(op, rest, undefined);
  }

  return {
    ok: false,
    error: `Couldn't parse "${input}". Try: integrate x*sin(x) dx · simplify · factor x**2-1 · solve for x`,
  };
}
