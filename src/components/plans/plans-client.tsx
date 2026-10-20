"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus, Loader2, AlertCircle } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PlanRow } from "@/components/plans/plan-row";
import { CoverageMap } from "@/components/plans/coverage-map";
import { AISuggestionsPanel } from "@/components/plans/ai-suggestions-panel";
import {
  type TestPlanData,
  computePlanStats,
} from "@/components/plans/plan-types";
import { apiErrorMessage } from "@/lib/api-client";
import { PlanGenerationProgress, type PlanPhase } from "@/components/plans/plan-generation-progress";

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
  /** False until the repository has been indexed; generating is refused (409) */
  isIndexed?: boolean;
}

const NOT_INDEXED_HINT = "Index the repository first. Plans are generated from the indexed code.";

export function PlansClient({
  projectId, projectName, plans, coverageNodes = [], isIndexed = true,
}: PlansClientProps) {
  const router = useRouter();
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(
    plans.find((p) => p.isActive)?.id ?? null
  );
  const [generating, setGenerating] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<PlanPhase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [suggestionsRefreshKey, setSuggestionsRefreshKey] = useState(0);

  const handleGenerate = useCallback(async () => {
    if (!projectId || generating || !isIndexed) return;

    setGenerating(true);
    setCurrentPhase(null);
    setError(null);
    setComplete(false);

    // Track whether the stream ended with an error using a local variable
    // (avoids the stale-closure issue with reading React state mid-async)
    let streamFailed = false;

    try {
      const response = await fetch(`/api/projects/${projectId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "full", stream: true }),
      });

      if (!response.ok) {
        throw new Error(await apiErrorMessage(response, "Failed to generate plan"));
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7);
          } else if (line.startsWith("data: ") && eventType) {
            try {
              const data = JSON.parse(line.slice(6));
              if (eventType === "plan:phase") {
                setCurrentPhase(data);
              } else if (eventType === "plan:complete") {
                setCurrentPhase({ phase: "complete", message: "Plan generated!", progress: 100 });
                setComplete(true);
                setSuggestionsRefreshKey((k) => k + 1);
              } else if (eventType === "plan:error") {
                streamFailed = true;
                setError(data.message);
              }
            } catch {
              // Skip malformed events
            }
            eventType = "";
          }
        }
      }

      if (!streamFailed) {
        await new Promise((r) => setTimeout(r, 800));
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }, [projectId, generating, isIndexed, router]);

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
        disabledReason={isIndexed ? null : NOT_INDEXED_HINT}
        onGenerate={handleGenerate}
      />

      {/* Errors stay visible after the progress panel closes */}
      {error && !generating && (
        <div role="alert" className="flex items-start gap-2 text-sm text-red-400 bg-red-400/[0.06] rounded-md px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Generation progress overlay */}
      <AnimatePresence>
        {generating && (
          <PlanGenerationProgress
            phase={currentPhase}
            error={error}
            complete={complete}
          />
        )}
      </AnimatePresence>

      {plans.length === 0 && !generating && (
        <EmptyState
          icon={ClipboardList}
          title="No test plans yet"
          description={isIndexed ? "Generate your first test plan from the indexed system map." : NOT_INDEXED_HINT}
          action={
            <Button
              className="bg-orbit-accent hover:bg-orbit-accent/90 text-white gap-2"
              onClick={handleGenerate}
              disabled={generating || !isIndexed}
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
          onGeneratePlan={isIndexed ? handleGenerate : () => setError(NOT_INDEXED_HINT)}
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
  disabledReason,
  onGenerate,
}: {
  projectName: string | null;
  planCount: number;
  generating: boolean;
  disabledReason: string | null;
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
        disabled={generating || !!disabledReason}
        title={disabledReason ?? undefined}
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
