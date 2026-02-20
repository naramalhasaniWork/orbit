"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Play, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/shared/status-dot";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import { RunsFilter } from "@/components/runs/runs-filter";
import { RunsSummaryBar } from "@/components/runs/runs-summary-bar";
import {
  type RunListItem,
  RUN_STATUS_CONFIG,
  MODE_LABELS,
  TRIGGER_LABELS,
  formatDuration,
  getRunVerdictStatus,
} from "@/components/runs/run-types";
import { formatDistanceToNow } from "date-fns";

interface RunsClientProps {
  projectId: string | null;
  projectName: string | null;
  runs: RunListItem[];
}

interface Filters {
  status: string | null;
  mode: string | null;
  trigger: string | null;
}

export function RunsClient({ projectId, projectName, runs }: RunsClientProps) {
  const [filters, setFilters] = useState<Filters>({
    status: null,
    mode: null,
    trigger: null,
  });

  const filteredRuns = useMemo(() => {
    return runs.filter((run) => {
      if (filters.status && run.status !== filters.status) return false;
      if (filters.mode && run.mode !== filters.mode) return false;
      if (filters.trigger && run.trigger !== filters.trigger) return false;
      return true;
    });
  }, [runs, filters]);

  if (!projectId) {
    return (
      <EmptyState
        icon={Play}
        title="No project selected"
        description="Connect a repository first to run tests."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Test Runs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {projectName ? `${projectName} — ` : ""}
            {runs.length} {runs.length === 1 ? "run" : "runs"}
          </p>
        </div>
      </div>

      <RunsSummaryBar runs={runs} />

      <RunsFilter filters={filters} onFiltersChange={setFilters} runs={runs} />

      {filteredRuns.length === 0 ? (
        <EmptyState
          icon={Play}
          title="No runs found"
          description={
            runs.length > 0
              ? "No runs match the current filters."
              : "Trigger your first test run to see results here."
          }
        />
      ) : (
        <div className="rounded-xl surface-1 border border-border overflow-hidden divide-y divide-border">
          {filteredRuns.map((run) => (
            <RunRow key={run.id} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}

function RunRow({ run }: { run: RunListItem }) {
  const statusConfig = RUN_STATUS_CONFIG[run.status];
  const verdictStatus = getRunVerdictStatus(run);
  const isInProgress = verdictStatus === "running";

  return (
    <Link
      href={`/dashboard/runs/${run.id}`}
      className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/20 transition-colors group"
    >
      <StatusDot
        status={statusConfig?.dot ?? "untested"}
        pulse={isInProgress}
        size="md"
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {TRIGGER_LABELS[run.trigger] ?? run.trigger}
          </span>
          <Badge
            className={cn(
              "text-[10px] px-1.5 py-0 font-medium border",
              "bg-muted/50 text-muted-foreground border-border/50"
            )}
          >
            {MODE_LABELS[run.mode] ?? run.mode}
          </Badge>
          <Badge
            className={cn(
              "text-[10px] px-1.5 py-0 font-medium border",
              statusConfig?.dot === "pass" && "bg-orbit-pass/15 text-orbit-pass border-orbit-pass/30",
              statusConfig?.dot === "fail" && "bg-orbit-fail/15 text-orbit-fail border-orbit-fail/30",
              statusConfig?.dot === "running" && "bg-orbit-accent/15 text-orbit-accent border-orbit-accent/30",
              statusConfig?.dot === "untested" && "bg-muted/50 text-muted-foreground border-border/50",
              statusConfig?.dot === "skipped" && "bg-muted/50 text-muted-foreground border-border/50"
            )}
          >
            {statusConfig?.label ?? run.status}
          </Badge>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <span>
            {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}
          </span>
          {run.branch && (
            <span className="font-mono truncate max-w-[120px]">{run.branch}</span>
          )}
          {run.commitSha && (
            <span className="font-mono">{run.commitSha.slice(0, 7)}</span>
          )}
        </div>
      </div>

      <TestCountsDisplay run={run} />

      <span className="text-xs text-muted-foreground tabular-nums w-16 text-right">
        {formatDuration(run.durationMs)}
      </span>

      <ArrowRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors shrink-0" />
    </Link>
  );
}

function TestCountsDisplay({ run }: { run: RunListItem }) {
  if (run.totalTests === 0) {
    return <span className="text-xs text-muted-foreground w-28 text-right">--</span>;
  }

  return (
    <div className="flex items-center gap-2 text-xs tabular-nums w-28 justify-end">
      {run.passed > 0 && <span className="text-orbit-pass">{run.passed}P</span>}
      {run.failed > 0 && <span className="text-orbit-fail">{run.failed}F</span>}
      {run.flaky > 0 && <span className="text-orbit-flaky">{run.flaky}Fl</span>}
      {run.skipped > 0 && <span className="text-muted-foreground">{run.skipped}S</span>}
    </div>
  );
}
