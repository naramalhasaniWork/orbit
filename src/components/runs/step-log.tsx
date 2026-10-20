"use client";

import { cn } from "@/lib/utils";
import { parseSteps, formatStepDuration } from "@/lib/runs/steps";
import { STATUS_TONES, type StatusTone } from "@/lib/status-tone";

interface StepLogProps {
  steps: unknown;
}

const TONE: Record<"pass" | "fail" | "pending", StatusTone> = {
  pass: "pass",
  fail: "fail",
  pending: "untested",
};

/** Numbered step list: folio, glyph, action, duration. The failing step carries a fail rule. */
export function StepLog({ steps }: StepLogProps) {
  const parsed = parseSteps(steps);
  if (parsed.length === 0) return null;

  return (
    <div>
      <span className="tm-label text-tm-t3">Steps</span>
      <ol className="mt-2">
        {parsed.map((step, i) => {
          const tone = STATUS_TONES[TONE[step.status]];
          return (
            <li
              key={i}
              className={cn(
                "relative grid grid-cols-[24px_16px_1fr_auto] items-baseline gap-2 py-1 pl-2 text-[13px]",
                step.status === "fail" && "bg-tm-fail-bg/60",
                step.status === "pending" && "text-tm-t3"
              )}
            >
              {step.status === "fail" && (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 w-px origin-top bg-tm-fail motion-safe:animate-[tm-rule-down_180ms_var(--ease-out)_both]"
                />
              )}
              <span className="tm-num text-[10.5px] text-tm-t3">{String(i + 1).padStart(2, "0")}</span>
              <span aria-hidden="true" className={cn("font-label text-xs", tone.text)}>
                {tone.glyph}
              </span>
              <span className="min-w-0">
                <span className="sr-only">{tone.label}: </span>
                <span className={cn(step.status === "fail" && "font-medium text-foreground")}>{step.action}</span>
                {step.detail && <span className="mt-0.5 block text-[12px] text-tm-t2 text-pretty">{step.detail}</span>}
              </span>
              <span className="tm-num pr-2 text-[10.5px] text-tm-t2">
                {step.durationMs !== undefined ? formatStepDuration(step.durationMs) : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
