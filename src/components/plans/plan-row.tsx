"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PlanSummary } from "@/components/plans/plan-summary";
import { JourneyGroup } from "@/components/plans/journey-group";
import { AddTestDialog } from "@/components/plans/add-test-dialog";
import { PlanApproval } from "@/components/plans/plan-approval";
import { PlanTestFilters } from "@/components/plans/plan-test-filters";
import { PlanBulkActions } from "@/components/plans/plan-bulk-actions";
import { useRowSelection } from "@/hooks/use-row-selection";
import { useUrlParams } from "@/hooks/use-url-state";
import { filterTestCases, groupByJourney } from "@/lib/plans/test-case-filter";
import { type TestPlanData, type PlanSummaryStats } from "@/components/plans/plan-types";
import { formatDistanceToNow } from "date-fns";

const FILTER_DEFAULTS = { q: "", type: "", show: "all" };

interface PlanRowProps {
  plan: TestPlanData;
  stats: PlanSummaryStats;
  isExpanded: boolean;
  onToggle: () => void;
  projectId: string | null;
}

export function PlanRow({ plan, stats, isExpanded, onToggle, projectId }: PlanRowProps) {
  const router = useRouter();
  const [showAddTest, setShowAddTest] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [filters, setFilters] = useUrlParams(FILTER_DEFAULTS);
  const visibleCases = useMemo(() => filterTestCases(plan.testCases, filters), [plan.testCases, filters]);
  const journeyGroups = useMemo(() => groupByJourney(visibleCases), [visibleCases]);
  // Shift-click ranges follow what is on screen: journey by journey, in order.
  const visibleIds = useMemo(() => journeyGroups.flatMap((g) => g.cases.map((c) => c.id)), [journeyGroups]);
  const selection = useRowSelection(visibleIds);
  const selectedCases = visibleCases.filter((c) => selection.selected.has(c.id));
  const caseTypes = useMemo(() => Array.from(new Set(plan.testCases.map((c) => c.type))), [plan.testCases]);
  const refresh = useCallback(() => router.refresh(), [router]);

  const approval = (plan.summary as Record<string, unknown>)?.approval as {
    status: string;
    approvedBy: string;
    approvedAt: string;
    notes: string | null;
  } | undefined;

  async function handleRegenerate() {
    if (!projectId) return;
    setRegenerating(true);
    setRegenError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "full" }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setRegenError((json as { error?: { message?: string } }).error?.message ?? "Plan generation failed");
        return;
      }
      router.refresh();
    } catch {
      setRegenError("Plan generation failed. Please try again.");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="rounded-xl surface-1 border border-border overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/[0.04] transition-colors duration-150 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orbit-accent/50 focus-visible:ring-inset"
      >
        <ChevronRight
          className={cn(
            "h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200",
            isExpanded && "rotate-90"
          )}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">v{plan.version}</span>
            <Badge
              className={cn(
                "text-[10px] px-1.5 py-0 font-medium border",
                plan.isActive
                  ? "bg-orbit-pass/15 text-orbit-pass border-orbit-pass/30"
                  : "bg-muted/50 text-muted-foreground border-border/50"
              )}
            >
              {plan.isActive ? "Active" : "Inactive"}
            </Badge>
            <span className="text-xs text-muted-foreground">{plan.generatedBy}</span>
          </div>
          <span className="text-xs text-muted-foreground mt-0.5 block">
            {formatDistanceToNow(new Date(plan.createdAt), { addSuffix: true })}
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs tabular-nums text-muted-foreground shrink-0">
          <span>{stats.total} cases</span>
          <span>{stats.enabled} enabled</span>
          {stats.critical > 0 && (
            <span className="text-orbit-fail">{stats.critical} critical</span>
          )}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-border">
              <PlanSummary stats={stats} />

              {projectId && (
                <>
                  <div className="px-5 pb-3 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5"
                      onClick={(e) => { e.stopPropagation(); setShowAddTest(!showAddTest); }}
                    >
                      <Plus className="h-3 w-3" />
                      Add Test
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5"
                      onClick={(e) => { e.stopPropagation(); handleRegenerate(); }}
                      disabled={regenerating}
                    >
                      <RefreshCw className={cn("h-3 w-3", regenerating && "animate-spin")} />
                      {regenerating ? "Re-generating..." : "Re-generate Plan"}
                    </Button>
                  </div>
                  {regenError && (
                    <div className="px-5 pb-2 text-xs text-orbit-fail">{regenError}</div>
                  )}
                </>
              )}

              {projectId && approval !== undefined && (
                <div className="px-5 pb-3">
                  <PlanApproval
                    projectId={projectId}
                    planId={plan.id}
                    approval={approval}
                    onApproved={() => router.refresh()}
                  />
                </div>
              )}

              {showAddTest && projectId && (
                <div className="px-5 pb-3">
                  <AddTestDialog
                    projectId={projectId}
                    planId={plan.id}
                    onSaved={() => { setShowAddTest(false); router.refresh(); }}
                    onClose={() => setShowAddTest(false)}
                  />
                </div>
              )}

              {projectId && (
                <PlanTestFilters
                  filters={filters}
                  onChange={setFilters}
                  types={caseTypes}
                  shownCount={visibleCases.length}
                  totalCount={plan.testCases.length}
                  allSelected={selection.allSelected}
                  onToggleAll={() => (selection.allSelected ? selection.clear() : selection.selectAll())}
                />
              )}

              <div className="px-5 pb-4 space-y-4">
                {journeyGroups.map(({ journey, cases }) => (
                  <JourneyGroup
                    key={journey}
                    journey={journey}
                    testCases={cases}
                    projectId={projectId ?? undefined}
                    selection={projectId ? { selected: selection.selected, onToggle: selection.toggle } : undefined}
                  />
                ))}
                {journeyGroups.length === 0 && plan.testCases.length > 0 && (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    No test cases match these filters.
                  </p>
                )}
              </div>

              {projectId && (
                <div className="px-5 pb-4">
                  <PlanBulkActions
                    projectId={projectId}
                    testCases={selectedCases}
                    onClear={selection.clear}
                    onDone={refresh}
                  />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
