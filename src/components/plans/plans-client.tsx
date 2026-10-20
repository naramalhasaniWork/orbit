"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus, Loader2 } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PlanRow } from "@/components/plans/plan-row";
import { CoverageMap } from "@/components/plans/coverage-map";
import { AISuggestionsPanel } from "@/components/plans/ai-suggestions-panel";
import { PlanGenerationProgress } from "@/components/plans/plan-generation-progress";
import { usePlanGeneration } from "@/hooks/use-plan-generation";
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
  const router = useRouter();
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(
    plans.find((p) => p.isActive)?.id ?? null
  );
  const [suggestionsRefreshKey, setSuggestionsRefreshKey] = useState(0);

  const handleCompleted = useCallback(() => {
    setSuggestionsRefreshKey((k) => k + 1);
    router.refresh();
  }, [router]);

  const generation = usePlanGeneration({ projectId, onCompleted: handleCompleted });
  const generating = generation.active || generation.starting;
  const { start } = generation;
  const handleGenerate = useCallback(() => start({ mode: "full" }), [start]);

  if (!projectId) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No project selected"
        description="Connect a repository first to generate test plans."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        projectName={projectName}
        planCount={plans.length}
        generating={generating}
        onGenerate={handleGenerate}
      />

      {/* Generation progress overlay */}
      <AnimatePresence>
        {(generating || generation.error) && (
          <PlanGenerationProgress job={generation.job} error={generation.error} />
        )}
      </AnimatePresence>

      {plans.length === 0 && !generating && (
        <EmptyState
          icon={ClipboardList}
          title="No test plans yet"
          description="Generate your first test plan from the indexed system map."
          action={
            <Button
              className="bg-orbit-accent hover:bg-orbit-accent/90 text-white gap-2"
              onClick={handleGenerate}
              disabled={generating}
            >
              <Plus className="h-4 w-4" />
              Generate Plan
            </Button>
          }
        />
      )}

      {plans.length > 0 && (
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
                onRegenerate={handleGenerate}
                generating={generating}
              />
            );
          })}
        </div>
      )}

      {coverageNodes.length > 0 && <CoverageMap nodes={coverageNodes} />}

      {/* AI suggestions always visible when project exists */}
      {projectId && (
        <AISuggestionsPanel
          projectId={projectId}
          onGeneratePlan={handleGenerate}
          refreshKey={suggestionsRefreshKey}
        />
      )}
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
        {generating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
        {generating ? "Generating..." : "Generate New Plan"}
      </Button>
    </div>
  );
}
