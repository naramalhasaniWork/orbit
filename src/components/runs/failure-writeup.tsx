"use client";

import { FailureAnalysis } from "@/components/runs/failure-analysis";
import { FailureEvidence } from "@/components/runs/failure-evidence";
import { StepLog } from "@/components/runs/step-log";
import { parseSteps } from "@/lib/runs/steps";
import type { TestResultData } from "@/components/runs/run-types";

interface FailureWriteupProps {
  result: TestResultData;
  projectId?: string;
  runId: string;
  /** How many other tests failed in this run. */
  otherFailures: number;
}

/**
 * "What broke": the run's first failure, explained before anything else.
 * Plain English, then Before / Action / After, then the suggested fix; the step log sits beside it.
 */
export function FailureWriteup({ result, projectId, runId, otherFailures }: FailureWriteupProps) {
  const steps = parseSteps(result.steps);
  const failed = steps.find((s) => s.status === "fail");
  const headline = failed
    ? `${result.testCase.name} fails at “${failed.action}”.`
    : `${result.testCase.name} failed.`;

  return (
    <section
      aria-labelledby="what-broke"
      className="motion-safe:animate-slide-up grid gap-6 rounded-lg border border-border bg-card p-5 lg:grid-cols-[minmax(0,1fr)_280px]"
    >
      <div className="min-w-0 space-y-4">
        <div className="space-y-2">
          <span className="tm-label text-tm-fail">
            <span aria-hidden="true">✕ </span>What broke
            {otherFailures > 0 && <span className="text-tm-t3"> · +{otherFailures} more below</span>}
          </span>
          <h2 id="what-broke" className="text-balance text-[22px] font-medium leading-tight tracking-display">
            {headline}
          </h2>
        </div>
        <FailureAnalysis
          failureExplanation={result.failureExplanation}
          suggestedFix={result.suggestedFix}
          evidence={
            projectId && failed ? (
              <FailureEvidence
                projectId={projectId}
                runId={runId}
                resultId={result.id}
                failedIndex={failed.index}
                action={failed.action}
              />
            ) : null
          }
          projectId={projectId}
          testResultId={result.id}
          testCaseName={result.testCase.name}
          runId={runId}
        />
      </div>
      <aside className="min-w-0 lg:border-l lg:border-border lg:pl-5">
        <StepLog steps={result.steps} />
      </aside>
    </section>
  );
}
