"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ChevronRight, AlertTriangle, ArrowUp, Minus, ArrowDown, Loader2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { PlanTestCase } from "../onboarding-types";

type Priority = "critical" | "high" | "medium" | "low";

const PRIORITY_CONFIG: Record<
  Priority,
  { icon: typeof AlertTriangle; color: string; bg: string }
> = {
  critical: { icon: AlertTriangle, color: "text-orbit-fail", bg: "bg-orbit-fail/10" },
  high: { icon: ArrowUp, color: "text-orbit-flaky", bg: "bg-orbit-flaky/10" },
  medium: { icon: Minus, color: "text-orbit-accent", bg: "bg-orbit-accent/10" },
  low: { icon: ArrowDown, color: "text-muted-foreground", bg: "bg-muted/50" },
};

function getPriority(score: number): Priority {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}

interface PlanPreviewProps {
  projectId: string;
  onContinue: (enabledCount: number) => void;
  onBack: () => void;
}

export function PlanPreview({ projectId, onContinue, onBack }: PlanPreviewProps) {
  const [tests, setTests] = useState<PlanTestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggledIds = useRef(new Set<string>());

  const fetchOrGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // First try to get an existing plan
      const getRes = await fetch(`/api/projects/${projectId}/plan`);
      const getJson = await getRes.json();

      if (getRes.ok && getJson.success && getJson.data.testCases?.length > 0) {
        setTests(getJson.data.testCases);
        setLoading(false);
        return;
      }

      // No existing plan — generate one
      setGenerating(true);
      const postRes = await fetch(`/api/projects/${projectId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "full" }),
      });

      const postJson = await postRes.json();
      if (!postRes.ok || !postJson.success) {
        setError(postJson.error?.message ?? "Failed to generate test plan");
        return;
      }

      // Fetch the full plan with test cases
      const refetchRes = await fetch(`/api/projects/${projectId}/plan`);
      const refetchJson = await refetchRes.json();

      if (refetchRes.ok && refetchJson.success) {
        setTests(refetchJson.data.testCases ?? []);
      }
    } catch {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
      setGenerating(false);
    }
  }, [projectId]);

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

  const byPriority = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const t of tests) {
      if (t.isEnabled) counts[getPriority(t.priorityScore)]++;
    }
    return counts;
  }, [tests]);

  const journeys = useMemo(() => {
    const map = new Map<string, PlanTestCase[]>();
    for (const t of tests) {
      const key = t.journey ?? "Uncategorized";
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [tests]);

  if (loading) {
    return (
      <div className="flex flex-col items-center w-full max-w-2xl mx-auto">
        <div className="text-center mb-6">
          <h2 className="text-xl font-semibold text-foreground mb-2">
            {generating ? "Generating test plan..." : "Loading test plan..."}
          </h2>
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {generating
              ? "Orbit is analyzing your codebase and creating test cases"
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
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Test plan generated
        </h2>
        <p className="text-sm text-muted-foreground">
          Orbit created {tests.length} test cases across {journeys.length} user
          journeys. Toggle any tests you want to skip.
        </p>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap justify-center">
        {(["critical", "high", "medium", "low"] as const).map((priority) => {
          const config = PRIORITY_CONFIG[priority];
          const Icon = config.icon;
          return (
            <Badge
              key={priority}
              variant="outline"
              className={cn("gap-1.5 capitalize", config.color)}
            >
              <Icon className="h-3 w-3" />
              {byPriority[priority]} {priority}
            </Badge>
          );
        })}
      </div>

      <ScrollArea className="w-full h-[320px] rounded-lg surface-1">
        <div className="p-4 space-y-5">
          {journeys.map(([journey, items]) => (
            <div key={journey}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {journey}
                </span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {items.filter((t) => t.isEnabled).length}/{items.length}
                </Badge>
              </div>
              <div className="space-y-0.5">
                {items.map((test) => {
                  const priority = getPriority(test.priorityScore);
                  const pc = PRIORITY_CONFIG[priority];
                  const PIcon = pc.icon;
                  return (
                    <div
                      key={test.id}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                        test.isEnabled ? "hover:bg-white/[0.04]" : "opacity-40"
                      )}
                    >
                      <div className={cn("flex items-center justify-center h-5 w-5 rounded", pc.bg)}>
                        <PIcon className={cn("h-3 w-3", pc.color)} />
                      </div>
                      <span className="text-sm text-foreground flex-1">{test.name}</span>
                      <Switch
                        checked={test.isEnabled}
                        onCheckedChange={() => toggleTest(test.id)}
                        className="scale-90"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <p className="text-sm text-muted-foreground mt-4 tabular-nums">
        {enabledCount} of {tests.length} tests ready to run
      </p>

      <div className="flex items-center gap-3 mt-4">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button
          className="bg-orbit-accent hover:bg-orbit-accent/90 text-white gap-2"
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
              <Loader2 className="h-4 w-4 animate-spin" />
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
