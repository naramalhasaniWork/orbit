"use client";

import { Pending } from "@/components/telemetry/pending";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ChevronRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlanGeneration } from "@/hooks/use-plan-generation";
import { PlanJourneys } from "./plan-journeys";
import type { PlanTestCase } from "../onboarding-types";

interface PlanPreviewProps {
  projectId: string;
  onContinue: (enabledCount: number) => void;
  onBack: () => void;
}

export function PlanPreview({ projectId, onContinue, onBack }: PlanPreviewProps) {
  const [tests, setTests] = useState<PlanTestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localError, setError] = useState<string | null>(null);
  const toggledIds = useRef(new Set<string>());

  const loadPlan = useCallback(async (): Promise<boolean> => {
    const res = await fetch(`/api/projects/${projectId}/plan`);
    const json = await res.json();
    if (!res.ok || !json.success || !(json.data.testCases?.length > 0)) return false;
    setTests(json.data.testCases);
    return true;
  }, [projectId]);

  // Generation runs as a background job; this resumes one already in flight.
  const generation = usePlanGeneration({
    projectId,
    onCompleted: () => {
      loadPlan()
        .catch(() => setError("Failed to load the generated plan"))
        .finally(() => setLoading(false));
    },
  });
  const { start } = generation;
  const generating = generation.active || generation.starting;

  const fetchOrGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (await loadPlan()) {
        setLoading(false);
        return;
      }
      await start({ mode: "full" });
    } catch {
      setError("Failed to connect to server");
      setLoading(false);
    }
  }, [loadPlan, start]);

  useEffect(() => {
    fetchOrGenerate();
  }, [fetchOrGenerate]);

  const toggleTest = (id: string) => {
    toggledIds.current.add(id);
    setTests((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isEnabled: !t.isEnabled } : t))
    );
  };

  const persistToggledTests = async (): Promise<boolean> => {
    if (toggledIds.current.size === 0) return true;

    const toUpdate = tests.filter((t) => toggledIds.current.has(t.id));
    const results = await Promise.allSettled(
      toUpdate.map((t) =>
        fetch(`/api/projects/${projectId}/test-cases/${t.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isEnabled: t.isEnabled }),
        })
      )
    );

    const allOk = results.every(
      (r) => r.status === "fulfilled" && r.value.ok
    );
    if (allOk) toggledIds.current.clear();
    return allOk;
  };

  const enabledCount = tests.filter((t) => t.isEnabled).length;

  const journeyCount = useMemo(() => new Set(tests.map((t) => t.journey ?? "Other")).size, [tests]);
  const criticalCount = tests.filter((t) => t.isCritical && t.isEnabled).length;

  const error = localError ?? generation.error;

  if (loading && !error) {
    return (
      <div className="flex flex-col items-center w-full max-w-2xl mx-auto">
        <div className="text-center mb-6">
          <h2 className="mb-2 text-balance text-[22px] font-medium tracking-display">
            {generating ? "Generating test plan..." : "Loading test plan..."}
          </h2>
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Pending />
            {generating
              ? generation.job?.message ?? "Orbit is analyzing your codebase and creating test cases"
              : "Loading existing plan"}
          </p>
        </div>
        <div className="w-full space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center w-full max-w-2xl mx-auto">
        <div className="flex items-center gap-2 text-sm text-orbit-fail bg-orbit-fail/10 rounded-md px-3 py-2 mb-4">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onBack}>Back</Button>
          <Button variant="outline" onClick={fetchOrGenerate}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full max-w-2xl mx-auto">
      <div className="text-center mb-6">
        <h2 className="mb-2 text-balance text-[22px] font-medium tracking-display">
          {journeyCount === 1 ? "1 journey" : `${journeyCount} journeys`} to walk
        </h2>
        <p className="text-pretty text-sm text-muted-foreground">
          Orbit read the map and planned the journeys most likely to break, with why and the routes each one goes through.
        </p>
      </div>

      <p className="tm-label mb-3 text-tm-t2">
        <span className="tm-num">{tests.length}</span> tests · <span className="tm-num">{criticalCount}</span> critical · switch off any to skip
      </p>

      <div className="w-full max-h-[420px] overflow-auto overscroll-contain rounded-lg border border-border bg-card">
        <PlanJourneys tests={tests} onToggle={toggleTest} />
      </div>

      <p className="text-sm text-muted-foreground mt-4 tabular-nums">
        {enabledCount} of {tests.length} tests ready to run
      </p>

      <div className="flex items-center gap-3 mt-4">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button
          className="bg-primary hover:bg-primary/85 text-primary-foreground gap-2"
          size="lg"
          disabled={enabledCount === 0 || saving}
          onClick={async () => {
            setSaving(true);
            setError(null);
            const ok = await persistToggledTests();
            setSaving(false);
            if (!ok) {
              setError("Failed to save test selections. Please try again.");
              return;
            }
            onContinue(enabledCount);
          }}
        >
          {saving ? (
            <>
              <Pending />
              Saving...
            </>
          ) : (
            <>
              Continue
              <ChevronRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
