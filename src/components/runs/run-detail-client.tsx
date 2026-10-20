"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TestResultCard } from "@/components/runs/test-result-card";
import { VerdictFilterBar } from "@/components/runs/verdict-filter-bar";
import { FailureWriteup } from "@/components/runs/failure-writeup";
import { RunHeader } from "@/components/runs/run-header";
import { RunStatStrip } from "@/components/runs/run-stat-strip";
import { FailurePatternsPanel } from "@/components/runs/failure-patterns-panel";
import { TraceViewer } from "@/components/runs/trace-viewer";
import { RunScreenshotsTab } from "@/components/runs/run-screenshots-tab";
import { RunVisualTab } from "@/components/runs/run-visual-tab";
import type { VisualDiffData } from "@/components/runs/visual-diff-viewer";
import { LiveExecutionViewer } from "@/components/execution/live-viewer";
import { LiveDot } from "@/components/telemetry/live-dot";
import { useRunEvents } from "@/hooks/use-run-events";
import { type RunDetailData } from "@/components/runs/run-types";
import { formatRunTitle } from "@/lib/runs/run-title";
import { useBreadcrumbLabel } from "@/components/layout/breadcrumb-context";
import { isLiveRunStatus, toneForRun, toneForVerdict } from "@/lib/status-tone";
import type { GroundTrackTick } from "@/components/telemetry/ground-track";

interface RunDetailClientProps {
  run: RunDetailData;
  projectId?: string;
  visualResults?: VisualDiffData[];
  previousRunId?: string;
}

const LIVE_STATUSES = new Set(["queued", "executing", "indexing", "planning", "reporting"]);

export function RunDetailClient({ run, projectId, visualResults = [], previousRunId }: RunDetailClientProps) {
  const router = useRouter();
  const [verdictFilter, setVerdictFilter] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const [liveResults, setLiveResults] = useState<RunDetailData["results"]>([]);
  const hasRefreshedRef = useRef(false);
  const title = formatRunTitle(run);
  useBreadcrumbLabel(formatRunTitle({ ...run, projectName: null }));

  const initialLive = LIVE_STATUSES.has(run.status);

  const handleRunComplete = useCallback(() => {
    if (hasRefreshedRef.current) return;
    hasRefreshedRef.current = true;
    setTimeout(() => router.refresh(), 1500);
  }, [router]);

  const handleTestCompleted = useCallback(
    (data: { testCaseId: string; testCaseName: string; verdict: string; durationMs: number }) => {
      if (!projectId) return;
      setLiveResults((prev) => {
        if (prev.some((r) => r.testCase?.id === data.testCaseId)) return prev;
        return [
          ...prev,
          {
            id: `live-${data.testCaseId}`,
            verdict: data.verdict,
            durationMs: data.durationMs,
            steps: [],
            artifacts: {},
            healedSelectors: [],
            createdAt: new Date(),
            testCase: {
              id: data.testCaseId,
              name: data.testCaseName,
              type: "functional",
              journey: "",
              priorityScore: 0,
              isCritical: false,
            },
          } as unknown as RunDetailData["results"][number],
        ];
      });
    },
    [projectId]
  );

  // SSE-driven live data — lifted here so stat cards + badge + viewer all share it
  const { progress, steps, tests } = useRunEvents({
    projectId: projectId ?? "",
    runId: run.id,
    enabled: initialLive && !!projectId,
    onComplete: handleRunComplete,
    onTestCompleted: handleTestCompleted,
  });

  // Merge: local cancellation > SSE > server static
  const liveStatus = localStatus === "cancelled"
    ? "cancelled"
    : progress?.status ?? run.status;
  const livePassed = progress?.passed ?? run.passed;
  const liveFailed = progress?.failed ?? run.failed;
  const liveFlaky = progress?.flaky ?? run.flaky;
  const liveTotal = progress?.totalTests ?? run.totalTests;
  const liveCompleted = progress?.completed
    ?? (run.passed + run.failed + run.flaky);

  const isLive = LIVE_STATUSES.has(liveStatus);
  const tone = toneForRun(liveStatus, { failed: liveFailed, flaky: liveFlaky });
  const defaultTab = isLive ? "live" : "results";

  // Elapsed timer — counts up while run is live
  const [elapsed, setElapsed] = useState<number>(run.durationMs ?? 0);
  useEffect(() => {
    if (!isLive) {
      setElapsed(run.durationMs ?? 0);
      return;
    }
    const start = new Date(run.createdAt).getTime();
    const tick = () => setElapsed(Date.now() - start);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isLive, run.createdAt, run.durationMs]);

  const mergedResults = useMemo(() => {
    const serverIds = new Set(run.results.map((r) => r.testCase?.id));
    const newLive = liveResults.filter((r) => !serverIds.has(r.testCase?.id));
    return [...run.results, ...newLive];
  }, [run.results, liveResults]);

  const filteredResults = useMemo(() => {
    if (!verdictFilter) return mergedResults;
    return mergedResults.filter((r) => r.verdict === verdictFilter);
  }, [mergedResults, verdictFilter]);

  const handleCancelRun = useCallback(async () => {
    if (!projectId || cancelling) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/runs/${run.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (res.ok) {
        setLocalStatus("cancelled");
        router.refresh();
        return;
      }
      const json = await res.json().catch(() => ({}));
      setCancelError(
        (json as { error?: { message?: string } }).error?.message ??
          `Couldn't cancel this run (${res.status}).`
      );
    } catch {
      setCancelError("Couldn't cancel this run. Check your connection and try again.");
    } finally {
      setCancelling(false);
    }
  }, [projectId, run.id, cancelling, router]);

  // The first failure gets the write-up; the list below starts with it collapsed.
  const firstFailure = isLive ? undefined : mergedResults.find((r) => toneForVerdict(r.verdict) === "fail");
  const failureCount = mergedResults.filter((r) => toneForVerdict(r.verdict) === "fail").length;
  // One tick per finished test: from the results when we have them, otherwise from the live counts.
  const ticks: GroundTrackTick[] =
    mergedResults.length >= livePassed + liveFailed + liveFlaky
      ? mergedResults.map((r) => ({ tone: toneForVerdict(r.verdict) }))
      : [
          ...Array.from({ length: livePassed }, () => ({ tone: "pass" as const })),
          ...Array.from({ length: liveFlaky }, () => ({ tone: "flaky" as const })),
          ...Array.from({ length: liveFailed }, () => ({ tone: "fail" as const })),
        ];
  if (isLiveRunStatus(liveStatus) && ticks.length < liveTotal) ticks.push({ tone: "live" });

  return (
    <div className="space-y-6">
      <RunHeader
        run={run}
        title={title}
        tone={tone}
        status={liveStatus}
        completed={liveCompleted}
        total={liveTotal}
        elapsedMs={elapsed}
        previousRunId={previousRunId}
        onCancel={isLive && projectId ? handleCancelRun : undefined}
        cancelling={cancelling}
        cancelError={cancelError}
      />

      <RunStatStrip
        passed={livePassed}
        failed={liveFailed}
        flaky={liveFlaky}
        total={liveTotal}
        ticks={ticks}
        live={isLive}
      />

      {firstFailure && (
        <FailureWriteup
          result={firstFailure}
          projectId={projectId}
          runId={run.id}
          otherFailures={failureCount - 1}
        />
      )}

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList>
          {isLive && (
            <TabsTrigger value="live" className="gap-1.5">
              <LiveDot size="sm" />
              Live
            </TabsTrigger>
          )}
          <TabsTrigger value="results">
            Results{mergedResults.length > 0 ? ` (${mergedResults.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="screenshots">Screenshots</TabsTrigger>
          <TabsTrigger value="traces">Traces</TabsTrigger>
          {projectId && visualResults.length > 0 && (
            <TabsTrigger value="visual">Visual ({visualResults.length})</TabsTrigger>
          )}
        </TabsList>

        {isLive && (
          <TabsContent value="live" className="mt-4">
            {projectId ? (
              <LiveExecutionViewer
                projectId={projectId}
                runId={run.id}
                runStatus={liveStatus}
                enabled={isLive}
                progress={progress}
                steps={steps}
                tests={tests}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Project context required for live view.</p>
            )}
          </TabsContent>
        )}

        <TabsContent value="results" className="mt-4 space-y-4">
          <VerdictFilterBar results={mergedResults} selected={verdictFilter} onSelect={setVerdictFilter} />
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {filteredResults.map((result) => (
              <TestResultCard
                key={result.id}
                result={result}
                projectId={projectId}
                runId={run.id}
                defaultExpanded={result.verdict === "fail" && result.id !== firstFailure?.id}
              />
            ))}
          </div>
          {projectId && liveFailed > 0 && <FailurePatternsPanel projectId={projectId} />}
        </TabsContent>

        <TabsContent value="screenshots" className="mt-4">
          {projectId ? (
            <RunScreenshotsTab projectId={projectId} runId={run.id} />
          ) : (
            <p className="text-sm text-muted-foreground">Project context required to view screenshots.</p>
          )}
        </TabsContent>

        <TabsContent value="traces" className="mt-4">
          {projectId ? (
            <TraceViewer projectId={projectId} runId={run.id} />
          ) : (
            <p className="text-sm text-muted-foreground">Project context required to view traces.</p>
          )}
        </TabsContent>

        {projectId && visualResults.length > 0 && (
          <TabsContent value="visual" className="mt-4">
            <RunVisualTab results={visualResults} projectId={projectId} runId={run.id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
