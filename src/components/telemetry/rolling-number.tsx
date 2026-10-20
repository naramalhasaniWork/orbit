"use client";

import { useState } from "react";
import { useReducedMotionSafe } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface RollingNumberProps {
  value: number | string;
  /** Formats numeric values; defaults to the locale with grouping. */
  format?: (n: number) => string;
  className?: string;
}

const defaultFormat = (n: number) => n.toLocaleString("en-US");

/**
 * Numbers roll, they don't fade: each changed digit rolls up over 180ms.
 * First paint and reduced motion show the final value immediately.
 */
export function RollingNumber({ value, format = defaultFormat, className }: RollingNumberProps) {
  const reduced = useReducedMotionSafe();
  const text = typeof value === "number" ? format(value) : value;

  // Previous value, tracked during render (no effect needed).
  const [current, setCurrent] = useState(text);
  const [previous, setPrevious] = useState(text);
  if (text !== current) {
    setPrevious(current);
    setCurrent(text);
  }

  if (reduced || previous === current) {
    return <span className={cn("tabular-nums", className)}>{text}</span>;
  }

  return (
    <span className={cn("inline-flex tabular-nums", className)}>
      <span className="sr-only">{text}</span>
      {Array.from(text).map((char, i) => (
        <span key={`${i}-${char}`} aria-hidden="true" className="inline-block overflow-hidden">
          <span
            className={cn(
              "inline-block",
              previous[i] !== char && "animate-[tm-roll_180ms_var(--ease-out)_both]"
            )}
          >
            {char}
          </span>
        </span>
      ))}
    </span>
  );
}
