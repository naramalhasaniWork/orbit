"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ShieldAlert, Image as ImageIcon } from "lucide-react";
import { tween, expandCollapse } from "@/lib/motion";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/shared/status-dot";
import { StepLog } from "@/components/runs/step-log";
import { FailureAnalysis } from "@/components/runs/failure-analysis";
import { cn } from "@/lib/utils";
import { type TestResultData, formatDuration } from "@/components/runs/run-types";
import { TEST_TYPE_CONFIG } from "@/components/plans/plan-types";

interface TestResultCardProps {
  result: TestResultData;
  projectId?: string;
  runId?: string;
}

const verdictDot: Record<string, "pass" | "fail" | "flaky" | "untested"> = {
  pass: "pass",
  fail: "fail",
  flaky: "flaky",
  healed: "pass",
  skipped: "untested",
};

const verdictBadge: Record<string, string> = {
  pass: "bg-orbit-pass/15 text-orbit-pass border-orbit-pass/30",
  fail: "bg-orbit-fail/15 text-orbit-fail border-orbit-fail/30",
  flaky: "bg-orbit-flaky/15 text-orbit-flaky border-orbit-flaky/30",
  healed: "bg-orbit-accent/15 text-orbit-accent border-orbit-accent/30",
  skipped: "bg-muted/50 text-muted-foreground border-border/50",
};

function parseArtifacts(artifacts: unknown): { screenshots: string[] } {
  if (typeof artifacts === "object" && artifacts !== null) {
    const a = artifacts as Record<string, unknown>;
    const screenshots = Array.isArray(a.screenshots) ? (a.screenshots as string[]) : [];
    return { screenshots };
  }
  return { screenshots: [] };
}

export function TestResultCard({ result, projectId, runId }: TestResultCardProps) {
  const [expanded, setExpanded] = useState(result.verdict === "fail");
  const dot = verdictDot[result.verdict] ?? "untested";
  const typeConfig = TEST_TYPE_CONFIG[result.testCase.type];
  const hasDetails = result.failureExplanation || result.suggestedFix ||
    (Array.isArray(result.steps) && (result.steps as unknown[]).length > 0);
  const { screenshots } = parseArtifacts(result.artifacts);

  return (
    <motion.div
      className={cn(
        "rounded-xl surface-1 border border-border overflow-hidden",
        result.verdict === "fail" && "border-orbit-fail/20"
      )}
      whileHover={{ scale: 1.003, boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}
      whileTap={{ scale: 0.998 }}
      transition={{ duration: 0.15 }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/20 transition-colors text-left"
      >
        {hasDetails && (
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200",
              expanded && "rotate-90"
            )}
          />
        )}

        <StatusDot status={dot} size="md" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {result.testCase.name}
            </span>
            {result.testCase.isCritical && (
              <ShieldAlert className="h-3.5 w-3.5 text-orbit-fail shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge
              className={cn(
                "text-[10px] px-1.5 py-0 font-medium border",
                typeConfig?.className ?? "bg-muted/50 text-muted-foreground border-border/50"
              )}
            >
              {typeConfig?.label ?? result.testCase.type}
            </Badge>
            {result.testCase.journey && (
              <span className="text-xs text-muted-foreground">
                {result.testCase.journey}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {screenshots.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ImageIcon className="h-3 w-3" />
              {screenshots.length}
            </span>
          )}
          {result.retryCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {result.retryCount}x retry
            </span>
          )}
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatDuration(result.durationMs)}
          </span>
          <motion.div
            initial={(result.verdict === "fail" || result.verdict === "flaky") ? { scale: 0.8, opacity: 0 } : false}
            animate={(result.verdict === "fail" || result.verdict === "flaky") ? { scale: 1, opacity: 1 } : undefined}
            transition={tween.change}
          >
            <Badge
              className={cn(
                "text-[10px] px-1.5 py-0 font-medium border",
                verdictBadge[result.verdict] ?? verdictBadge.skipped
              )}
            >
              {result.verdict}
            </Badge>
          </motion.div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && hasDetails && (
          <motion.div
            variants={expandCollapse}
            initial="initial"
            animate="animate"
            exit="exit"
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 border-t border-border space-y-4">
              <StepLog steps={result.steps} />

              {(result.failureExplanation || result.suggestedFix) && (
                <FailureAnalysis
                  failureExplanation={result.failureExplanation}
                  suggestedFix={result.suggestedFix}
                  projectId={projectId}
                  testResultId={result.id}
                  testCaseName={result.testCase.name}
                  runId={runId}
                />
              )}

              {screenshots.length > 0 && (
                <ScreenshotThumbs urls={screenshots} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ScreenshotThumbs({ urls }: { urls: string[] }) {
  return (
    <div>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        Screenshots
      </span>
      <div className="mt-2 flex gap-2 flex-wrap">
        {urls.map((url, i) => (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="block h-16 w-24 rounded-md bg-muted/30 border border-border overflow-hidden hover:border-orbit-accent/40 transition-colors"
          >
            <div className="h-full w-full flex items-center justify-center text-muted-foreground">
              <ImageIcon className="h-4 w-4" />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
