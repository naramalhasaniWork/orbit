"use client";

import { useState } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PlanRow } from "@/components/plans/plan-row";
import { CoverageMap } from "@/components/plans/coverage-map";
import { AISuggestionsPanel } from "@/components/plans/ai-suggestions-panel";
import {
  type TestPlanData,
  computePlanStats,
} from "@/components/plans/plan-types";

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
              projectId={projectId}
            />
          );
        })}
      </div>

      {coverageNodes.length > 0 && <CoverageMap nodes={coverageNodes} />}

      {projectId && <AISuggestionsPanel projectId={projectId} />}
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
