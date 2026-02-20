"use client";

import { CheckCircle2, XCircle, Clock, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepLogProps {
  steps: unknown;
}

interface ParsedStep {
  action: string;
  status: "pass" | "fail" | "pending";
  durationMs?: number;
  detail?: string;
  screenshot?: string;
}

export function StepLog({ steps }: StepLogProps) {
  const parsedSteps = parseStepLog(steps);

  if (parsedSteps.length === 0) return null;

  return (
    <div>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        Execution Steps
      </span>
      <div className="mt-2 relative">
        {/* Timeline connector line */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/[0.06]" />

        <div className="space-y-0">
          {parsedSteps.map((step, i) => (
            <div key={i} className="flex items-start gap-3 py-1.5 relative">
              <div className="relative z-10 shrink-0">
                <StepIcon status={step.status} />
              </div>
              <div className="flex-1 min-w-0 pt-px">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-xs",
                      step.status === "pass" && "text-foreground/80",
                      step.status === "fail" && "text-orbit-fail",
                      step.status === "pending" && "text-muted-foreground"
                    )}
                  >
                    <span className="text-muted-foreground tabular-nums mr-1.5">
                      {i + 1}.
                    </span>
                    {step.action}
                  </span>
                  {step.screenshot && (
                    <ImageIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                  )}
                </div>
                {step.detail && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 pl-4">
                    {step.detail}
                  </p>
                )}
              </div>
              {step.durationMs !== undefined && (
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0 pt-px">
                  {formatStepDuration(step.durationMs)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepIcon({ status }: { status: "pass" | "fail" | "pending" }) {
  const base = "h-[15px] w-[15px] shrink-0";
  if (status === "pass") {
    return <CheckCircle2 className={cn(base, "text-orbit-pass")} />;
  }
  if (status === "fail") {
    return <XCircle className={cn(base, "text-orbit-fail")} />;
  }
  return <Clock className={cn(base, "text-muted-foreground")} />;
}

function formatStepDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function parseStepLog(steps: unknown): ParsedStep[] {
  if (!Array.isArray(steps)) return [];

  return steps.map((step) => {
    if (typeof step === "string") {
      return { action: step, status: "pass" as const };
    }

    if (typeof step === "object" && step !== null) {
      const s = step as Record<string, unknown>;
      return {
        action: (s.action ?? s.description ?? s.name ?? JSON.stringify(step)) as string,
        status: parseStepStatus(s.status),
        durationMs: typeof s.durationMs === "number" ? s.durationMs : undefined,
        detail: typeof s.detail === "string" ? s.detail : undefined,
        screenshot: typeof s.screenshot === "string" ? s.screenshot : undefined,
      };
    }

    return { action: JSON.stringify(step), status: "pass" as const };
  });
}

function parseStepStatus(raw: unknown): "pass" | "fail" | "pending" {
  if (typeof raw !== "string") return "pass";
  if (raw === "fail" || raw === "failed" || raw === "error") return "fail";
  if (raw === "pending" || raw === "running" || raw === "skipped") return "pending";
  return "pass";
}
