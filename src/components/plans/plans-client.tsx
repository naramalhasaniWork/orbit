"use client";

import { useState, useCallback } from "react";
import { ClipboardList, Plus, Loader2, Check, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PlanRow } from "@/components/plans/plan-row";
import { CoverageMap } from "@/components/plans/coverage-map";
import { AISuggestionsPanel } from "@/components/plans/ai-suggestions-panel";
import {
  type TestPlanData,
  computePlanStats,
} from "@/components/plans/plan-types";
import { cn } from "@/lib/utils";

interface CoverageNode {
  id: string;
  name: string;
  type: string;
  filePath: string;
  coverageStatus: "covered" | "partial" | "none";
  testCount: number;
}

interface PlanPhase {
  phase: string;
  message: string;
  progress: number;
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
  const [generating, setGenerating] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<PlanPhase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!projectId || generating) return;

    setGenerating(true);
    setCurrentPhase(null);
    setError(null);
    setComplete(false);

    try {
      const response = await fetch(`/api/projects/${projectId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "full", stream: true }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate plan: ${response.status}`);
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
              } else if (eventType === "plan:error") {
                setError(data.message);
              }
            } catch {
              // Skip malformed events
            }
            eventType = "";
          }
        }
      }

      // Brief delay to show completion state, then reload
      if (!error) {
        await new Promise((r) => setTimeout(r, 800));
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }, [projectId, generating, error]);

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
        {generating && (
          <PlanGenerationProgress
            phase={currentPhase}
            error={error}
            complete={complete}
          />
        )}
      </AnimatePresence>

      {plans.length === 0 && !generating ? (
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
      ) : (
        <>
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
          {projectId && (
            <AISuggestionsPanel projectId={projectId} onGeneratePlan={handleGenerate} />
          )}
        </>
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

const PHASE_LABELS: Record<string, string> = {
  coverage: "Analyzing Coverage",
  journeys: "Mapping User Journeys",
  generating: "Generating Test Cases",
  prioritizing: "Prioritizing Tests",
  saving: "Saving Plan",
  complete: "Complete",
};

const PHASE_ORDER = ["coverage", "journeys", "generating", "prioritizing", "saving", "complete"];

function PlanGenerationProgress({
  phase,
  error,
  complete,
}: {
  phase: PlanPhase | null;
  error: string | null;
  complete: boolean;
}) {
  const currentPhaseIdx = phase ? PHASE_ORDER.indexOf(phase.phase) : -1;
  const progress = phase?.progress ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-4"
    >
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground font-medium">
            {error ? "Generation Failed" : phase?.message ?? "Starting..."}
          </span>
          <span className="text-muted-foreground tabular-nums">{progress}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <motion.div
            className={cn(
              "h-full rounded-full transition-colors",
              error ? "bg-red-400" : complete ? "bg-emerald-400" : "bg-orbit-accent"
            )}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Phase steps */}
      <div className="grid grid-cols-3 gap-2">
        {PHASE_ORDER.slice(0, -1).map((p, idx) => {
          const isDone = idx < currentPhaseIdx || complete;
          const isCurrent = idx === currentPhaseIdx && !complete && !error;

          return (
            <div
              key={p}
              className={cn(
                "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors",
                isDone && "bg-emerald-400/[0.08] text-emerald-400",
                isCurrent && "bg-orbit-accent/[0.08] text-orbit-accent",
                !isDone && !isCurrent && "bg-white/[0.02] text-muted-foreground/50"
              )}
            >
              {isDone ? (
                <Check className="h-3 w-3 shrink-0" />
              ) : isCurrent ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              ) : (
                <div className="h-3 w-3 shrink-0 rounded-full border border-current opacity-30" />
              )}
              <span className="truncate">{PHASE_LABELS[p] ?? p}</span>
            </div>
          );
        })}
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-2 text-xs text-red-400 bg-red-400/[0.06] rounded-md px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </motion.div>
  );
}
