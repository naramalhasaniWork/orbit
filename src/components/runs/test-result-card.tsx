"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { expandCollapse } from "@/lib/motion";
import { Status } from "@/components/telemetry/status";
import { StepLog } from "@/components/runs/step-log";
import { FailureAnalysis } from "@/components/runs/failure-analysis";
import { cn } from "@/lib/utils";
import { toneForVerdict } from "@/lib/status-tone";
import { type TestResultData, formatDuration } from "@/components/runs/run-types";
import { TEST_TYPE_CONFIG } from "@/components/plans/plan-types";

interface TestResultCardProps {
  result: TestResultData;
  projectId?: string;
  runId?: string;
  /** Open on first render (the run page opens failures that aren't already in the write-up). */
  defaultExpanded?: boolean;
}

function screenshotCount(artifacts: unknown): number {
  if (typeof artifacts !== "object" || artifacts === null) return 0;
  const shots = (artifacts as Record<string, unknown>).screenshots;
  return Array.isArray(shots) ? shots.length : 0;
}

const VERDICT_WORD: Record<string, string> = { healed: "Healed", environment_error: "Env error" };

/** One test in a run: glyph + word, name, journey, duration; expands to steps and the write-up. */
export function TestResultCard({ result, projectId, runId, defaultExpanded = false }: TestResultCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const panelId = useId();
  const tone = toneForVerdict(result.verdict);
  const type = TEST_TYPE_CONFIG[result.testCase.type];
  const shots = screenshotCount(result.artifacts);
  const hasDetails =
    !!result.failureExplanation || !!result.suggestedFix || (Array.isArray(result.steps) && result.steps.length > 0);

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        disabled={!hasDetails}
        aria-expanded={hasDetails ? expanded : undefined}
        aria-controls={hasDetails ? panelId : undefined}
        className="grid min-h-11 w-full grid-cols-[16px_88px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent"
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "size-3.5 text-tm-t3 transition-transform duration-change",
            expanded && "rotate-90",
            !hasDetails && "invisible"
          )}
        />
        <Status tone={tone} label={VERDICT_WORD[result.verdict]} mono />
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-foreground">
            {result.testCase.name}
            {result.testCase.isCritical && <span className="tm-label ml-2 rounded-sm border border-tm-line-strong px-1 text-tm-t2">Critical</span>}
          </span>
          {result.testCase.journey && (
            <span className="block truncate text-[12px] text-tm-t2">{result.testCase.journey}</span>
          )}
        </span>
        <span className="tm-num flex shrink-0 items-center gap-3 text-[10.5px] text-tm-t2">
          <span className="tm-label hidden text-tm-t3 sm:inline">{type?.label ?? result.testCase.type}</span>
          {result.retryCount > 0 && <span>{result.retryCount}× retry</span>}
          {shots > 0 && <span>{shots} shots</span>}
          <span>{formatDuration(result.durationMs)}</span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && hasDetails && (
          <motion.div
            id={panelId}
            variants={expandCollapse}
            initial="initial"
            animate="animate"
            exit="exit"
            className="overflow-hidden"
          >
            <div className="grid gap-5 px-3 pb-4 pt-2 lg:grid-cols-[minmax(0,1fr)_280px] lg:pl-10">
              <FailureAnalysis
                failureExplanation={result.failureExplanation}
                suggestedFix={result.suggestedFix}
                projectId={projectId}
                testResultId={result.id}
                testCaseName={result.testCase.name}
                runId={runId}
              />
              <StepLog steps={result.steps} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
