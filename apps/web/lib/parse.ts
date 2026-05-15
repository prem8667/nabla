import type { TransformRequest } from "./api";

/**
 * V0 parser: turn free-form chat input into a TransformRequest.
 *
 * Supports patterns like:
 *   integrate x*sin(x) dx
 *   integrate x*sin(x) d x
 *   ∫ x*sin(x) dx
 *   d/dx x**2
 *   diff x**2 dx
 *   simplify sin(x)**2 + cos(x)**2
 *   factor x**2 + 2*x*y + y**2
 *   expand (x+1)**3
 *   solve x**2 - 4
 *   solve x**2 - 4 for x
 *
 * If no pattern matches, returns { error }.
 *
 * V1 will replace this with an LLM that emits structured TransformActions.
 */
export type ParseResult =
  | { ok: true; req: TransformRequest; pretty: string }
  | { ok: false; error: string };

const trimDx = (s: string): { expr: string; var: string } => {
  const m = s.match(/^(.*?)\s*d\s*([a-zA-Z])\s*$/);
  if (m) return { expr: m[1].trim(), var: m[2] };
  return { expr: s.trim(), var: "x" };
};

export function parseCommand(raw: string): ParseResult {
  const input = raw.trim();
  if (!input) return { ok: false, error: "empty input" };

  // integrate <expr> dx   |   ∫ <expr> dx
  let m = input.match(/^(?:integrate|∫|int)\s+(.+)$/i);
  if (m) {
    const { expr, var: v } = trimDx(m[1]);
    if (!expr) return { ok: false, error: "missing expression after integrate" };
    return {
      ok: true,
      req: { expr, op: "integrate", args: { var: v } },
      pretty: `∫ ${expr} d${v}`,
    };
  }

  // d/dx <expr>   |   diff <expr> dx
  m = input.match(/^d\/d([a-zA-Z])\s+(.+)$/i);
  if (m) {
    const v = m[1];
    const expr = m[2].trim();
    return {
      ok: true,
      req: { expr, op: "diff", args: { var: v } },
      pretty: `d/d${v} [ ${expr} ]`,
    };
  }
  m = input.match(/^(?:diff|derivative)\s+(.+)$/i);
  if (m) {
    const { expr, var: v } = trimDx(m[1]);
    if (!expr) return { ok: false, error: "missing expression after diff" };
    return {
      ok: true,
      req: { expr, op: "diff", args: { var: v } },
      pretty: `d/d${v} [ ${expr} ]`,
    };
  }

  // simplify <expr>
  m = input.match(/^simplify\s+(.+)$/i);
  if (m) {
    return {
      ok: true,
      req: { expr: m[1].trim(), op: "simplify" },
      pretty: `simplify( ${m[1].trim()} )`,
    };
  }

  // factor <expr>
  m = input.match(/^factor\s+(.+)$/i);
  if (m) {
    return {
      ok: true,
      req: { expr: m[1].trim(), op: "factor" },
      pretty: `factor( ${m[1].trim()} )`,
    };
  }

  // expand <expr>
  m = input.match(/^expand\s+(.+)$/i);
  if (m) {
    return {
      ok: true,
      req: { expr: m[1].trim(), op: "expand" },
      pretty: `expand( ${m[1].trim()} )`,
    };
  }

  // solve <expr> [for <var>]
  m = input.match(/^solve\s+(.+?)(?:\s+for\s+([a-zA-Z]))?\s*$/i);
  if (m) {
    const expr = m[1].trim();
    const v = m[2] ?? "x";
    return {
      ok: true,
      req: { expr, op: "solve", args: { var: v } },
      pretty: `solve( ${expr} = 0, ${v} )`,
    };
  }

  return {
    ok: false,
    error: `Couldn't parse "${input}". Try: integrate x*sin(x) dx, d/dx x**2, simplify ..., factor ..., expand ..., solve ...`,
  };
}
