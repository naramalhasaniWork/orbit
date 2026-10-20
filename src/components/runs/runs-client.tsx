"use client";

import { Pending } from "@/components/telemetry/pending";
import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Play, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { SelectCheckbox } from "@/components/shared/select-checkbox";
import { RunsFilter } from "@/components/runs/runs-filter";
import { RunRow } from "@/components/runs/run-row";
import { RunsBulkActions } from "@/components/runs/runs-bulk-actions";
import { RunsSummaryBar } from "@/components/runs/runs-summary-bar";
import { RunsListSkeleton } from "@/components/runs/runs-skeleton";
import type { RunListItem } from "@/components/runs/run-types";
import { useRuns } from "@/hooks/use-runs";
import { useRowSelection } from "@/hooks/use-row-selection";
import { useUrlParams } from "@/hooks/use-url-state";
import { parsePositiveInt } from "@/lib/url-state";
import { filterRuns, isRunSort, paginate, sortRuns } from "@/lib/runs/run-list";
import { apiErrorMessage } from "@/lib/api-client";
import { InlineError } from "@/components/shared/inline-error";

const URL_DEFAULTS = { status: "", mode: "", trigger: "", sort: "newest", page: "1" };

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
  // Filters, sort and page live in the URL so reload and shared links restore the view.
  const [params, setParams] = useUrlParams(URL_DEFAULTS);
  const filters = useMemo(
    () => ({ status: params.status, mode: params.mode, trigger: params.trigger }),
    [params.status, params.mode, params.trigger]
  );
  const sort = isRunSort(params.sort) ? params.sort : "newest";
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
      if (!res.ok) {
        // Surface the server's reason (no credits, workers down, no plan…)
        setRunError(await apiErrorMessage(res, "Failed to start run"));
        return;
      }
      const json = (await res.json().catch(() => ({}))) as { data?: { id?: string } };
      // Revalidate SWR cache so runs list updates
      mutateRuns();
      if (json.data?.id) router.push(`/dashboard/runs/${json.data.id}`);
    } catch {
      setRunError("Failed to start run. Check your connection and try again.");
    } finally {
      setStartingRun(false);
    }
  }, [projectId, startingRun, router, mutateRuns]);

  const filteredRuns = useMemo(
    () => sortRuns(filterRuns(runs, filters), sort),
    [runs, filters, sort]
  );
  const pageData = paginate(filteredRuns, parsePositiveInt(params.page, 1));
  const pageIds = useMemo(() => pageData.items.map((r) => r.id), [pageData.items]);
  const selection = useRowSelection(pageIds);
  const selectedRuns = pageData.items.filter((r) => selection.selected.has(r.id));

  const changeFilters = useCallback(
    (next: Partial<typeof filters>) => setParams({ ...next, page: null }),
    [setParams]
  );
  const refreshRuns = useCallback(() => {
    mutateRuns();
    router.refresh();
  }, [mutateRuns, router]);

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
          <h1 className="text-balance text-[26px] font-medium leading-tight tracking-display">Test Runs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {projectName ? `${projectName} — ` : ""}
            {runs.length} {runs.length === 1 ? "run" : "runs"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            className="bg-primary hover:bg-primary/85 text-primary-foreground gap-2 disabled:opacity-60"
            onClick={preflightBlock ? undefined : handleStartRun}
            disabled={startingRun || !!preflightBlock}
            title={preflightBlock ?? undefined}
          >
            {startingRun ? (
              <Pending />
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
        </div>
      </div>

      <InlineError message={runError} />

      <RunsSummaryBar runs={runs} />

      <RunsFilter
        filters={filters}
        onFiltersChange={changeFilters}
        sort={sort}
        onSortChange={(next) => setParams({ sort: next, page: null })}
        runs={runs}
      />

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
                onClick={() => changeFilters({ status: "", mode: "", trigger: "" })}
                className="text-foreground hover:text-foreground"
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
        <>
          <div className="flex items-center gap-2 px-5 text-xs text-muted-foreground">
            <SelectCheckbox
              checked={selection.allSelected}
              onToggle={() => (selection.allSelected ? selection.clear() : selection.selectAll())}
              label="Select all runs on this page"
            />
            <span>Select all on page</span>
          </div>
          <motion.div
            variants={staggerContainer(0.04)}
            initial="hidden"
            animate="show"
            className="rounded-xl surface-1 border border-border overflow-hidden divide-y divide-border"
          >
            {pageData.items.map((run) => (
              <motion.div key={run.id} variants={staggerItem}>
                <RunRow
                  run={run}
                  selected={selection.selected.has(run.id)}
                  onToggleSelect={(shift) => selection.toggle(run.id, shift)}
                />
              </motion.div>
            ))}
          </motion.div>
          {pageData.pageCount > 1 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="tabular-nums">
                Page {pageData.page} of {pageData.pageCount} &middot; {pageData.total} runs
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  disabled={pageData.page <= 1}
                  onClick={() => setParams({ page: String(pageData.page - 1) })}
                >
                  <ChevronLeft className="h-3 w-3" /> Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  disabled={pageData.page >= pageData.pageCount}
                  onClick={() => setParams({ page: String(pageData.page + 1) })}
                >
                  Next <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <RunsBulkActions
        projectId={projectId}
        runs={selectedRuns}
        onClear={selection.clear}
        onDone={refreshRuns}
      />
    </div>
  );
}
