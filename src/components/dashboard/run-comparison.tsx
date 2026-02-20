"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/shared/status-dot";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowUp,
  ArrowDown,
  Minus,
  Clock,
  CheckCircle2,
  XCircle,
  Zap,
  Plus,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type ChangeType = "improved" | "regressed" | "unchanged" | "new" | "removed";

interface ComparedTest {
  testCaseId: string;
  testCaseName: string;
  type: string;
  journey: string | null;
  verdictA: string | null;
  verdictB: string | null;
  change: ChangeType;
  durationChangeMs: number | null;
}

interface RunSummary {
  id: string;
  status: string;
  mode: string;
  trigger: string;
  totalTests: number;
  passed: number;
  failed: number;
  flaky: number;
  createdAt: Date;
  branch?: string | null;
  commitSha?: string | null;
}

interface ComparisonSummary {
  improved: number;
  regressed: number;
  unchanged: number;
  newTests: number;
  removedTests: number;
}

interface RunComparisonProps {
  runA: RunSummary;
  runB: RunSummary;
  summary: ComparisonSummary;
  tests: ComparedTest[];
  className?: string;
}

// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------

const changeConfig: Record<
  ChangeType,
  {
    icon: React.ElementType;
    label: string;
    color: string;
    bg: string;
  }
> = {
  regressed: {
    icon: ArrowDown,
    label: "Regressed",
    color: "text-orbit-fail",
    bg: "bg-orbit-fail/10",
  },
  improved: {
    icon: ArrowUp,
    label: "Improved",
    color: "text-orbit-pass",
    bg: "bg-orbit-pass/10",
  },
  new: {
    icon: Plus,
    label: "New",
    color: "text-orbit-accent",
    bg: "bg-orbit-accent/10",
  },
  removed: {
    icon: Trash2,
    label: "Removed",
    color: "text-muted-foreground",
    bg: "bg-muted/30",
  },
  unchanged: {
    icon: Minus,
    label: "Unchanged",
    color: "text-muted-foreground",
    bg: "bg-white/[0.06]",
  },
};

function verdictDot(verdict: string | null): "pass" | "fail" | "flaky" | "untested" {
  if (verdict === "pass") return "pass";
  if (verdict === "fail") return "fail";
  if (verdict === "flaky") return "flaky";
  return "untested";
}

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

export function RunComparison({
  runA,
  runB,
  summary,
  tests,
  className,
}: RunComparisonProps) {
  const changedTests = useMemo(
    () => tests.filter((t) => t.change !== "unchanged"),
    [tests]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={cn("space-y-4", className)}
    >
      {/* Run headers — side by side */}
      <div className="grid grid-cols-2 gap-3">
        <RunCard run={runA} label="Run A (Before)" />
        <RunCard run={runB} label="Run B (After)" />
      </div>

      {/* Summary chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {(Object.keys(changeConfig) as ChangeType[]).map((type) => {
          const config = changeConfig[type];
          const count =
            type === "improved"
              ? summary.improved
              : type === "regressed"
                ? summary.regressed
                : type === "new"
                  ? summary.newTests
                  : type === "removed"
                    ? summary.removedTests
                    : summary.unchanged;

          if (count === 0) return null;

          return (
            <div
              key={type}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs",
                config.bg,
                config.color
              )}
            >
              <config.icon className="h-3 w-3" />
              <span className="font-medium tabular-nums">{count}</span>
              <span>{config.label}</span>
            </div>
          );
        })}
      </div>

      {/* Changed tests table */}
      <div className="rounded-xl surface-1 border border-border overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border">
          <span className="text-[13px] font-medium text-foreground">
            Changed Tests ({changedTests.length})
          </span>
        </div>

        <ScrollArea className="max-h-[480px]">
          {/* Header */}
          <div className="grid grid-cols-[1fr_100px_100px_80px_80px] gap-2 px-4 py-2 border-b border-border text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
            <span>Test Case</span>
            <span className="text-center">Before</span>
            <span className="text-center">After</span>
            <span className="text-center">Change</span>
            <span className="text-right">Duration</span>
          </div>

          {/* Rows */}
          {changedTests.map((test, i) => {
            const config = changeConfig[test.change];

            return (
              <motion.div
                key={test.testCaseId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02, duration: 0.2 }}
                className={cn(
                  "grid grid-cols-[1fr_100px_100px_80px_80px] gap-2 px-4 py-2.5 items-center",
                  "border-b border-border/50 hover:bg-white/[0.06] transition-colors",
                  test.change === "regressed" && "bg-orbit-fail/[0.03]",
                  test.change === "improved" && "bg-orbit-pass/[0.03]"
                )}
              >
                {/* Name */}
                <div className="min-w-0">
                  <span className="text-sm text-foreground truncate block">
                    {test.testCaseName}
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge
                      variant="outline"
                      className="text-[9px] h-3.5 px-1 py-0"
                    >
                      {test.type.replace("_", " ")}
                    </Badge>
                    {test.journey && (
                      <span className="text-[10px] text-muted-foreground truncate">
                        {test.journey}
                      </span>
                    )}
                  </div>
                </div>

                {/* Before verdict */}
                <div className="flex items-center justify-center gap-1.5">
                  {test.verdictA ? (
                    <>
                      <StatusDot status={verdictDot(test.verdictA)} />
                      <span className="text-xs text-muted-foreground">
                        {test.verdictA}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">--</span>
                  )}
                </div>

                {/* After verdict */}
                <div className="flex items-center justify-center gap-1.5">
                  {test.verdictB ? (
                    <>
                      <StatusDot status={verdictDot(test.verdictB)} />
                      <span className="text-xs text-muted-foreground">
                        {test.verdictB}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">--</span>
                  )}
                </div>

                {/* Change badge */}
                <div className="flex justify-center">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium",
                      config.bg,
                      config.color
                    )}
                  >
                    <config.icon className="h-2.5 w-2.5" />
                    {config.label}
                  </span>
                </div>

                {/* Duration change */}
                <div className="text-right">
                  {test.durationChangeMs !== null ? (
                    <span
                      className={cn(
                        "text-xs tabular-nums",
                        test.durationChangeMs > 0
                          ? "text-orbit-fail"
                          : test.durationChangeMs < 0
                            ? "text-orbit-pass"
                            : "text-muted-foreground"
                      )}
                    >
                      {test.durationChangeMs > 0 ? "+" : ""}
                      {(test.durationChangeMs / 1000).toFixed(1)}s
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">--</span>
                  )}
                </div>
              </motion.div>
            );
          })}

          {changedTests.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No differences between these runs.
            </div>
          )}
        </ScrollArea>
      </div>
    </motion.div>
  );
}

// ------------------------------------------------------------------
// Sub-component: Run card
// ------------------------------------------------------------------

function RunCard({ run, label }: { run: RunSummary; label: string }) {
  const passRate =
    run.totalTests > 0
      ? Math.round((run.passed / run.totalTests) * 100)
      : 0;

  return (
    <div className="rounded-xl surface-1 border border-border p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
          {label}
        </span>
        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
          {run.mode}
        </Badge>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-2xl font-semibold tabular-nums text-foreground">
          {passRate}%
        </span>
        <div className="flex items-center gap-3 text-xs tabular-nums">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-orbit-pass" />
            {run.passed}
          </span>
          <span className="flex items-center gap-1">
            <XCircle className="h-3 w-3 text-orbit-fail" />
            {run.failed}
          </span>
          {run.flaky > 0 && (
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3 text-orbit-flaky" />
              {run.flaky}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}
        </span>
        {run.branch && (
          <span className="truncate">{run.branch}</span>
        )}
        {run.commitSha && (
          <span className="font-mono">
            {run.commitSha.slice(0, 7)}
          </span>
        )}
      </div>

      {/* Mini bar */}
      {run.totalTests > 0 && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden flex">
          <div
            className="bg-orbit-pass h-full"
            style={{ width: `${(run.passed / run.totalTests) * 100}%` }}
          />
          <div
            className="bg-orbit-flaky h-full"
            style={{ width: `${(run.flaky / run.totalTests) * 100}%` }}
          />
          <div
            className="bg-orbit-fail h-full"
            style={{ width: `${(run.failed / run.totalTests) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
