"use client";

import { useOffscreen } from "@/hooks/use-offscreen";
import { cutForSize, type ClosingOState } from "@/lib/closing-o";
import { cn } from "@/lib/utils";

interface ClosingOProps {
  state?: ClosingOState;
  /** Rendered size in px; below 24 the small cut is used. */
  size?: number;
  /** Brand lockup: the dot carries the accent even when idle (marketing only). */
  brand?: boolean;
  /** Accessible name. Omit when a visible word already names it. */
  title?: string;
  className?: string;
}

const STATE_WORD: Record<ClosingOState, string> = {
  idle: "",
  running: "a run is live",
  passed: "last run passed",
  failed: "last run failed",
};

/**
 * The Closing O. idle: static. running: the dot travels once per 2.4s and the arc draws
 * behind it. passed: the arc closes in 280ms and the dot merges. failed: the dot stops and
 * becomes a fail-coloured square.
 */
export function ClosingO({ state = "idle", size = 24, brand = false, title, className }: ClosingOProps) {
  const cut = cutForSize(size);
  const { ref, offscreen } = useOffscreen<SVGSVGElement>();
  const name = title ?? (STATE_WORD[state] ? `Orbit, ${STATE_WORD[state]}` : undefined);
  const paused = offscreen ? { animationPlayState: "paused" as const } : undefined;
  const { cx, cy, r } = cut.dot;

  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={name ? "img" : undefined}
      aria-label={name}
      aria-hidden={name ? undefined : true}
      className={cn("shrink-0 overflow-visible text-tm-t1", className)}
    >
      {state === "running" && (
        <>
          <circle cx="12" cy="12" r="8.5" fill="none" className="stroke-tm-line-strong" strokeWidth={cut.stroke} />
          <circle
            cx="12"
            cy="12"
            r="8.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={cut.stroke}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100"
            transform="rotate(-90 12 12)"
            style={{ animation: "tm-trace 2.4s linear infinite", ...paused }}
          />
          <g style={{ transformOrigin: "12px 12px", animation: "tm-orbit 2.4s linear infinite", ...paused }}>
            <circle cx="12" cy="3.5" r={r} className="fill-tm-live" />
          </g>
        </>
      )}

      {state === "passed" && (
        <>
          <circle
            cx="12"
            cy="12"
            r="8.5"
            fill="none"
            className="stroke-tm-pass"
            strokeWidth={cut.stroke}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100"
            strokeDashoffset={100 - cut.arcPercent}
            transform={`rotate(${cut.startDeg} 12 12)`}
            style={{ animation: "tm-close 280ms var(--ease-out) forwards" }}
          />
          <circle
            cx={cx}
            cy={cy}
            r={r}
            className="fill-tm-pass"
            style={{ transformOrigin: `${cx}px ${cy}px`, animation: "tm-merge 280ms var(--ease-out) forwards" }}
          />
        </>
      )}

      {(state === "idle" || state === "failed") && (
        <path d={cut.arc} fill="none" stroke="currentColor" strokeWidth={cut.stroke} strokeLinecap="round" />
      )}
      {state === "idle" && <circle cx={cx} cy={cy} r={r} className={brand ? "fill-tm-live" : "fill-current"} />}
      {state === "failed" && (
        <rect
          x={cx - r}
          y={cy - r}
          width={2 * r}
          height={2 * r}
          rx={0.4}
          className="fill-tm-fail"
          style={{ transformOrigin: `${cx}px ${cy}px`, animation: "tm-dot-in 180ms var(--ease-out) both" }}
        />
      )}
    </svg>
  );
}
