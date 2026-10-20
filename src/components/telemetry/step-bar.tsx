"use client";

import { useState } from "react";
import { stepBarTiming, STEP_EXPECTED_MS, useReducedMotionSafe } from "@/lib/motion";
import { STATUS_TONES, type StatusTone } from "@/lib/status-tone";
import { cn } from "@/lib/utils";

interface StepBarProps {
  tone: StatusTone;
  /** When the step started (ms epoch). Only used while live. */
  startedAt?: number;
  expectedMs?: number;
  className?: string;
}

/**
 * A running step is a bar that keeps growing, never a spinner. scaleX from the left
 * (compositor only). When the step finishes, the bar settles to full width in its result tone.
 */
export function StepBar({ tone, startedAt, expectedMs = STEP_EXPECTED_MS, className }: StepBarProps) {
  const reduced = useReducedMotionSafe();
  // Read the clock once per mount; the negative delay carries it from there.
  const [mountedAt] = useState(() => Date.now());
  const live = tone === "live" && startedAt !== undefined;
  const timing = live ? stepBarTiming(startedAt, mountedAt, expectedMs) : null;

  return (
    <div role="presentation" className={cn("h-0.5 w-full overflow-hidden bg-tm-line", className)}>
      <div
        suppressHydrationWarning
        className={cn(
          "h-full w-full origin-left",
          STATUS_TONES[tone].fill,
          !live && !reduced && "animate-[tm-settle_180ms_var(--ease-out)_both]"
        )}
        style={
          timing
            ? reduced
              ? { transform: `scaleX(${timing.progress})` }
              : {
                  animation: `tm-draw ${timing.durationMs}ms linear ${timing.delayMs}ms both`,
                }
            : undefined
        }
      />
    </div>
  );
}
