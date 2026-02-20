"use client";

import { useState } from "react";
import { ClipboardList, Plus, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import { PlanSummary } from "@/components/plans/plan-summary";
import { JourneyGroup } from "@/components/plans/journey-group";
import { CoverageMap } from "@/components/plans/coverage-map";
import {
  type TestPlanData,
  computePlanStats,
} from "@/components/plans/plan-types";
import { formatDistanceToNow } from "date-fns";

interface CoverageNode {
  id: string;
  name: string;
  type: string;
  filePath: string;
  coverageStatus: "covered" | "partial" | "none";
  testCount: number;
}

interface PlansClientProps {
  projectId: string | null;
  projectName: string | null;
  plans: TestPlanData[];
  coverageNodes?: CoverageNode[];
}

export function PlansClient({ projectId, projectName, plans, coverageNodes = [] }: PlansClientProps) {
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(
    plans.find((p) => p.isActive)?.id ?? null
  );
  const [generatingPlan, setGeneratingPlan] = useState(false);

  if (!projectId) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No project selected"
        description="Connect a repository first to generate test plans."
      />
    );
  }

  if (plans.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          projectName={projectName}
          planCount={0}
          generating={generatingPlan}
          onGenerate={() => handleGenerate(projectId, setGeneratingPlan)}
        />
        <EmptyState
          icon={ClipboardList}
          title="No test plans yet"
          description="Generate your first test plan from the indexed system map."
          action={
            <Button
              className="bg-orbit-accent hover:bg-orbit-accent/90 text-white gap-2"
              onClick={() => handleGenerate(projectId, setGeneratingPlan)}
              disabled={generatingPlan}
            >
              <Plus className="h-4 w-4" />
              Generate Plan
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        projectName={projectName}
        planCount={plans.length}
        generating={generatingPlan}
        onGenerate={() => handleGenerate(projectId, setGeneratingPlan)}
      />

      <div className="space-y-3">
        {plans.map((plan) => {
          const isExpanded = expandedPlanId === plan.id;
          const stats = computePlanStats(plan.testCases);

          return (
            <PlanRow
              key={plan.id}
              plan={plan}
              stats={stats}
              isExpanded={isExpanded}
              onToggle={() => setExpandedPlanId(isExpanded ? null : plan.id)}
            />
          );
        })}
      </div>

      {coverageNodes.length > 0 && <CoverageMap nodes={coverageNodes} />}
    </div>
  );
}

function PageHeader({
  projectName,
  planCount,
  generating,
  onGenerate,
}: {
  projectName: string | null;
  planCount: number;
  generating: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Test Plans</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {projectName ? `${projectName} — ` : ""}
          {planCount} {planCount === 1 ? "plan" : "plans"}
        </p>
      </div>
      <Button
        className="bg-orbit-accent hover:bg-orbit-accent/90 text-white gap-2"
        onClick={onGenerate}
        disabled={generating}
      >
        <Plus className="h-4 w-4" />
        {generating ? "Generating..." : "Generate New Plan"}
      </Button>
    </div>
  );
}

function PlanRow({
  plan,
  stats,
  isExpanded,
  onToggle,
}: {
  plan: TestPlanData;
  stats: ReturnType<typeof computePlanStats>;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const journeyGroups = groupByJourney(plan.testCases);

  return (
    <div className="rounded-xl surface-1 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/[0.03] transition-colors text-left"
      >
        <ChevronRight
          className={cn(
            "h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200",
            isExpanded && "rotate-90"
          )}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              v{plan.version}
            </span>
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
            <span className="text-xs text-muted-foreground">
              {plan.generatedBy}
            </span>
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

      {isExpanded && (
        <div className="border-t border-white/[0.04]">
          <PlanSummary stats={stats} />
          <div className="px-5 pb-4 space-y-4">
            {journeyGroups.map(({ journey, cases }) => (
              <JourneyGroup key={journey} journey={journey} testCases={cases} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function groupByJourney(
  testCases: TestPlanData["testCases"]
): Array<{ journey: string; cases: TestPlanData["testCases"] }> {
  const groups = new Map<string, TestPlanData["testCases"]>();

  for (const tc of testCases) {
    const key = tc.journey ?? "Uncategorized";
    const existing = groups.get(key);
    if (existing) {
      existing.push(tc);
    } else {
      groups.set(key, [tc]);
    }
  }

  return Array.from(groups.entries()).map(([journey, cases]) => ({
    journey,
    cases,
  }));
}

async function handleGenerate(
  projectId: string,
  setGenerating: (v: boolean) => void
) {
  setGenerating(true);
  try {
    await fetch(`/api/projects/${projectId}/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "full" }),
    });
    window.location.reload();
  } catch {
    setGenerating(false);
  }
}
