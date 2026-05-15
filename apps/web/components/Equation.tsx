"use client";

import katex from "katex";
import { useEffect, useRef } from "react";

export function Equation({
  latex,
  displayMode = true,
  className = "",
}: {
  latex: string;
  displayMode?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      katex.render(latex, ref.current, {
        displayMode,
        throwOnError: false,
        output: "html",
      });
    } catch (e) {
      ref.current.textContent = latex;
    }
  }, [latex, displayMode]);

  return <div ref={ref} className={className} />;
}
