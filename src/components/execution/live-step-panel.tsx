"use client";

import { LiveList, LiveRow } from "@/components/execution/live-list";

export interface LiveStep {
  stepIndex: number;
  testCaseId: string;
  action: string;
  status: "running" | "passed" | "failed";
  durationMs?: number;
  error?: string;
}

interface LiveStepPanelProps {
  steps: LiveStep[];
  activeStepIndex: number | null;
  className?: string;
}

/** Steps of the live test; the active one has the live dot and a growing bar. */
export function LiveStepPanel({ steps, activeStepIndex, className }: LiveStepPanelProps) {
  return (
    <LiveList
      title="Steps"
      count={String(steps.length).padStart(2, "0")}
      empty="Waiting for the first step."
      followKey={`${steps.length}-${activeStepIndex}`}
      className={className}
    >
      {steps.map((step) => {
        const live = step.status === "running" || (step.stepIndex === activeStepIndex && step.status !== "failed" && step.status !== "passed");
        return (
          <LiveRow
            key={`${step.testCaseId}-${step.stepIndex}`}
            index={step.stepIndex}
            tone={live ? "live" : step.status === "failed" ? "fail" : "pass"}
            label={step.action}
            durationMs={step.durationMs}
            detail={step.error}
          />
        );
      })}
    </LiveList>
  );
}
