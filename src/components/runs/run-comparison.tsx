"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatRunTitle } from "@/lib/runs/run-title";

interface ComparedTest {
  testCaseId: string;
  testCaseName: string;
  type: string;
  journey: string | null;
  verdictA: string | null;
  verdictB: string | null;
  change: "improved" | "regressed" | "unchanged" | "new" | "removed";
  durationChangeMs: number | null;
}

interface RunSummary {
  id: string;
  sequenceNumber: number;
  prNumber: number | null;
  status: string;
  mode: string;
  totalTests: number;
  passed: number;
  failed: number;
  flaky: number;
  createdAt: string;
  branch: string | null;
  commitSha: string | null;
}

interface ComparisonData {
  runA: RunSummary;
  runB: RunSummary;
  summary: {
    improved: number;
    regressed: number;
    unchanged: number;
    newTests: number;
    removedTests: number;
  };
  tests: ComparedTest[];
}

interface RunComparisonProps {
  projectId: string;
  runAId: string;
  runBId: string;
}

const CHANGE_CONFIG: Record<string, { label: string; icon: typeof ArrowUpRight; className: string }> = {
  regressed: { label: "Regressed", icon: ArrowDownRight, className: "text-orbit-fail" },
  improved: { label: "Improved", icon: ArrowUpRight, className: "text-orbit-pass" },
  new: { label: "New", icon: Plus, className: "text-orbit-accent" },
  removed: { label: "Removed", icon: Trash2, className: "text-muted-foreground" },
  unchanged: { label: "Unchanged", icon: Minus, className: "text-muted-foreground" },
};

const VERDICT_COLORS: Record<string, string> = {
  pass: "text-orbit-pass",
  fail: "text-orbit-fail",
  flaky: "text-orbit-flaky",
  skipped: "text-muted-foreground",
  healed: "text-orbit-accent",
};

export function RunComparison({ projectId, runAId, runBId }: RunComparisonProps) {
  const [data, setData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [changeFilter, setChangeFilter] = useState<string | null>(null);

  useEffect(() => {
    async function fetchComparison() {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/runs/compare?runA=${runAId}&runB=${runBId}`
        );
        if (res.ok) {
          const json = await res.json();
          setData(json.data);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchComparison();
  }, [projectId, runAId, runBId]);

  const filteredTests = useMemo(() => {
    if (!data) return [];
    if (!changeFilter) return data.tests;
    return data.tests.filter((t) => t.change === changeFilter);
  }, [data, changeFilter]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-20 bg-muted/30 rounded-xl" />
        <div className="h-40 bg-muted/30 rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl surface-1 p-8 text-center">
        <p className="text-sm text-muted-foreground">Failed to load comparison data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <RunCard label="Run A (older)" run={data.runA} />
        <RunCard label="Run B (newer)" run={data.runB} />
      </div>

      {/* Change summary */}
      <div className="flex items-center gap-3">
        {Object.entries(data.summary).map(([key, count]) => {
          if (count === 0) return null;
          const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
          const configKey = key === "newTests" ? "new" : key === "removedTests" ? "removed" : key;
          const config = CHANGE_CONFIG[configKey];

          return (
            <button
              key={key}
              onClick={() => setChangeFilter(changeFilter === configKey ? null : configKey)}
              className={cn(
                "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors",
                changeFilter === configKey ? "bg-muted/40" : "hover:bg-muted/20",
                config?.className ?? "text-muted-foreground"
              )}
            >
              <span className="tabular-nums font-medium">{count}</span>
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Test list */}
      <div className="rounded-xl surface-1 divide-y divide-border overflow-hidden">
        {filteredTests.map((test) => {
          const config = CHANGE_CONFIG[test.change];
          const Icon = config?.icon ?? Minus;

          return (
            <div
              key={test.testCaseId}
              className="flex items-center gap-3 px-5 py-2.5"
            >
              <Icon className={cn("h-3.5 w-3.5 shrink-0", config?.className)} />
              <div className="flex-1 min-w-0">
                <span className="text-xs text-foreground truncate block">
                  {test.testCaseName}
                </span>
                {test.journey && (
                  <span className="text-[11px] text-muted-foreground">
                    {test.journey}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-[11px] tabular-nums shrink-0">
                <span className={cn(VERDICT_COLORS[test.verdictA ?? ""] ?? "text-muted-foreground")}>
                  {test.verdictA ?? "--"}
                </span>
                <span className="text-muted-foreground/30">→</span>
                <span className={cn(VERDICT_COLORS[test.verdictB ?? ""] ?? "text-muted-foreground")}>
                  {test.verdictB ?? "--"}
                </span>
              </div>
              {test.durationChangeMs !== null && (
                <span
                  className={cn(
                    "text-[11px] tabular-nums w-16 text-right",
                    test.durationChangeMs > 0 ? "text-orbit-flaky" : "text-orbit-pass"
                  )}
                >
                  {test.durationChangeMs > 0 ? "+" : ""}
                  {(test.durationChangeMs / 1000).toFixed(1)}s
                </span>
              )}
              <Badge
                className={cn(
                  "text-[9px] px-1.5 py-0 font-medium border",
                  config?.className,
                  "bg-transparent border-current/20"
                )}
              >
                {config?.label}
              </Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RunCard({ label, run }: { label: string; run: RunSummary }) {
  const passRate =
    run.totalTests > 0 ? Math.round((run.passed / run.totalTests) * 100) : 0;

  return (
    <div className="rounded-xl surface-1 p-4">
      <div className="text-[11px] text-muted-foreground mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground font-mono">
          {formatRunTitle(run)}
        </span>
        {run.branch && (
          <span className="text-xs text-muted-foreground font-mono">
            {run.branch}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 mt-2 text-xs tabular-nums">
        <span className="text-orbit-pass">{run.passed}P</span>
        <span className="text-orbit-fail">{run.failed}F</span>
        <span className="text-orbit-flaky">{run.flaky}Fl</span>
        <span className="text-muted-foreground">{passRate}%</span>
      </div>
    </div>
  );
}
