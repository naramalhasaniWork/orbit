"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Play, ArrowRight, Loader2, Filter } from "lucide-react";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/shared/status-dot";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import { RunsFilter } from "@/components/runs/runs-filter";
import { RunsSummaryBar } from "@/components/runs/runs-summary-bar";
import { RunsListSkeleton } from "@/components/runs/runs-skeleton";
import {
  type RunListItem,
  RUN_STATUS_CONFIG,
  MODE_LABELS,
  TRIGGER_LABELS,
  formatDuration,
  getRunVerdictStatus,
} from "@/components/runs/run-types";
import { formatDistanceToNow } from "date-fns";
import { useRuns } from "@/hooks/use-runs";

interface RunsClientProps {
  projectId: string | null;
  projectName: string | null;
  /** Server-fetched runs used as SWR fallback for instant first paint */
  initialRuns: RunListItem[];
  /** Whether the project has at least one non-production environment configured */
  hasEnvironment?: boolean;
  /** Whether the project has an active test plan */
  hasActivePlan?: boolean;
  /** Show skeleton loading state */
  loading?: boolean;
}

interface Filters {
  status: string | null;
  mode: string | null;
  trigger: string | null;
}

export function RunsClient({
  projectId,
  projectName,
  initialRuns,
  hasEnvironment = true,
  hasActivePlan = true,
  loading = false,
}: RunsClientProps) {
  const router = useRouter();
  // SWR keeps data fresh across navigations; initialRuns provides instant first paint
  const { runs: swrRuns, mutate: mutateRuns } = useRuns(projectId);
  const runs = swrRuns.length > 0 ? swrRuns : initialRuns;
  const [filters, setFilters] = useState<Filters>({
    status: null,
    mode: null,
    trigger: null,
  });
  const [startingRun, setStartingRun] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  // Derive a user-friendly preflight message before even hitting the API
  const preflightBlock = !hasEnvironment
    ? "Add a staging environment in Settings before running tests."
    : !hasActivePlan
    ? "Generate a test plan first before starting a run."
    : null;

  const handleStartRun = useCallback(async () => {
    if (!projectId || startingRun) return;
    setRunError(null);
    setStartingRun(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "full", trigger: "manual" }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        // Revalidate SWR cache so runs list updates
        mutateRuns();
        if ((json as { data?: { id?: string } }).data?.id) {
          router.push(`/dashboard/runs/${(json as { data: { id: string } }).data.id}`);
          return;
        }
        return;
      }
      // Surface the server error message to the user
      const msg =
        (json as { error?: { message?: string } }).error?.message ??
        `Failed to start run (${res.status})`;
      setRunError(msg);
    } catch {
      setRunError("Failed to start run. Check your connection and try again.");
    } finally {
      setStartingRun(false);
    }
  }, [projectId, startingRun, router, mutateRuns]);

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

  if (loading) {
    return <RunsListSkeleton />;
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
        <div className="flex flex-col items-end gap-1">
          <Button
            className="bg-orbit-accent hover:bg-orbit-accent/90 text-white gap-2 disabled:opacity-60"
            onClick={preflightBlock ? undefined : handleStartRun}
            disabled={startingRun || !!preflightBlock}
            title={preflightBlock ?? undefined}
          >
            {startingRun ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {startingRun ? "Starting..." : "Start New Run"}
          </Button>
          {preflightBlock && (
            <span className="text-[11px] text-muted-foreground text-right max-w-[220px]">
              {preflightBlock}
            </span>
          )}
          {runError && (
            <span className="text-[11px] text-orbit-fail text-right max-w-[220px]">
              {runError}
            </span>
          )}
        </div>
      </div>

      <RunsSummaryBar runs={runs} />

      <RunsFilter filters={filters} onFiltersChange={setFilters} runs={runs} />

      {filteredRuns.length === 0 ? (
        runs.length > 0 ? (
          <EmptyState
            icon={Filter}
            title="No runs match your filters"
            description="Try adjusting or clearing your filters to see runs."
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilters({ status: null, mode: null, trigger: null })}
                className="text-orbit-accent hover:text-orbit-accent/80"
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Play}
            title="No runs yet"
            description="Trigger your first test run to see results here."
          />
        )
      ) : (
        <motion.div
          variants={staggerContainer(0.04)}
          initial="hidden"
          animate="show"
          className="rounded-xl surface-1 border border-border overflow-hidden divide-y divide-border"
        >
          {filteredRuns.map((run) => (
            <motion.div key={run.id} variants={staggerItem}>
              <RunRow run={run} />
            </motion.div>
          ))}
        </motion.div>
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
      className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.04] transition-colors duration-150 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orbit-accent/50 focus-visible:ring-inset"
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

      <ArrowRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors duration-150 shrink-0" />
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

export { RunsListSkeleton } from "@/components/runs/runs-skeleton";
