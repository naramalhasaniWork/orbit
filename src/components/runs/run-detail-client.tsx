"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, GitBranch, Clock, Hash, XCircle, Loader2 } from "lucide-react";
import {
  staggerContainer,
  staggerScaleItem,
  springs,
  progressSpring,
  crossfade,
} from "@/lib/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatCard } from "@/components/shared/stat-card";
import { cn } from "@/lib/utils";
import { TestResultCard } from "@/components/runs/test-result-card";
import { FailurePatternsPanel } from "@/components/runs/failure-patterns-panel";
import { TraceViewer } from "@/components/runs/trace-viewer";
import { LiveExecutionViewer } from "@/components/execution/live-viewer";
import { useRunEvents } from "@/hooks/use-run-events";
import {
  type RunDetailData,
  RUN_STATUS_CONFIG,
  MODE_LABELS,
  TRIGGER_LABELS,
  formatDuration,
} from "@/components/runs/run-types";
import { formatDistanceToNow } from "date-fns";

interface RunDetailClientProps {
  run: RunDetailData;
  projectId?: string;
}

const LIVE_STATUSES = new Set(["queued", "executing", "indexing", "planning", "reporting"]);

export function RunDetailClient({ run, projectId }: RunDetailClientProps) {
  const router = useRouter();
  const [verdictFilter, setVerdictFilter] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const [liveResults, setLiveResults] = useState<RunDetailData["results"]>([]);
  const hasRefreshedRef = useRef(false);

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
  const liveExecuted = livePassed + liveFailed + liveFlaky;

  const isLive = LIVE_STATUSES.has(liveStatus);
  const statusConfig = RUN_STATUS_CONFIG[liveStatus];
  const defaultTab = isLive ? "live" : "results";

  const passRate = liveExecuted > 0
    ? `${Math.round((livePassed / liveExecuted) * 100)}%`
    : "--";

  const statusLabel = liveStatus === "executing" && liveTotal > 0
    ? `Executing ${liveCompleted}/${liveTotal}`
    : statusConfig?.label ?? liveStatus;

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
    try {
      const res = await fetch(`/api/projects/${projectId}/runs/${run.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (res.ok) {
        setLocalStatus("cancelled");
        router.refresh();
      } else {
        console.error("[CancelRun] API error:", res.status);
      }
    } catch (err) {
      console.error("[CancelRun] Network error:", err);
    } finally {
      setCancelling(false);
    }
  }, [projectId, run.id, cancelling, router]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.smooth}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/runs"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-foreground">
              Run {run.id.slice(0, 8)}
            </h1>
            <Badge
              className={cn(
                "text-[10px] px-1.5 py-0 font-medium border tabular-nums",
                statusConfig?.dot === "pass" && "bg-orbit-pass/15 text-orbit-pass border-orbit-pass/30",
                statusConfig?.dot === "fail" && "bg-orbit-fail/15 text-orbit-fail border-orbit-fail/30",
                statusConfig?.dot === "running" && "bg-orbit-accent/15 text-orbit-accent border-orbit-accent/30",
                (statusConfig?.dot === "untested" || statusConfig?.dot === "skipped") && "bg-muted/50 text-muted-foreground border-border/50"
              )}
            >
              {statusLabel}
            </Badge>
          </div>
          <RunMeta run={run} />
        </div>
        {isLive && projectId && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-orbit-fail border-orbit-fail/30 hover:bg-orbit-fail/10"
            onClick={handleCancelRun}
            disabled={cancelling}
          >
            {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
            {cancelling ? "Cancelling..." : "Cancel Run"}
          </Button>
        )}
      </div>

      {/* Live stat cards */}
      <motion.div
        variants={staggerContainer(0.04)}
        initial="hidden"
        animate="show"
        className="grid grid-cols-5 gap-3"
      >
        <motion.div variants={staggerScaleItem}><StatCard label="Pass Rate" value={passRate} /></motion.div>
        <motion.div variants={staggerScaleItem}><StatCard label="Passed" value={livePassed} /></motion.div>
        <motion.div variants={staggerScaleItem}><StatCard label="Failed" value={liveFailed} /></motion.div>
        <motion.div variants={staggerScaleItem}><StatCard label="Flaky" value={liveFlaky} /></motion.div>
        <motion.div variants={staggerScaleItem}><StatCard label="Duration" value={formatDuration(elapsed)} /></motion.div>
      </motion.div>

      <LiveResultsBar passed={livePassed} failed={liveFailed} flaky={liveFlaky} total={liveTotal} />

      {/* Tabs */}
      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList>
          {isLive && (
            <TabsTrigger value="live" className="gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orbit-accent opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-orbit-accent" />
              </span>
              Live
            </TabsTrigger>
          )}
          <TabsTrigger value="results">
            Results{mergedResults.length > 0 ? ` (${mergedResults.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="traces">Traces</TabsTrigger>
        </TabsList>

        {isLive && (
          <TabsContent value="live" className="mt-4">
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={springs.snappy}>
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
            </motion.div>
          </TabsContent>
        )}

        <TabsContent value="results" className="mt-4 space-y-4">
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={springs.snappy} className="space-y-4">
            <VerdictFilterBar results={mergedResults} selected={verdictFilter} onSelect={setVerdictFilter} />
            <div className="space-y-2">
              {filteredResults.map((result, i) => (
                <motion.div
                  key={result.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...springs.smooth, delay: Math.min(i * 0.03, 0.3) }}
                >
                  <TestResultCard result={result} projectId={projectId} runId={run.id} />
                </motion.div>
              ))}
            </div>
            {projectId && liveFailed > 0 && <FailurePatternsPanel projectId={projectId} />}
          </motion.div>
        </TabsContent>

        <TabsContent value="traces" className="mt-4">
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={springs.snappy}>
            {projectId ? (
              <TraceViewer projectId={projectId} runId={run.id} />
            ) : (
              <p className="text-sm text-muted-foreground">Project context required to view traces.</p>
            )}
          </motion.div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function RunMeta({ run }: { run: RunDetailData }) {
  return (
    <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
      <span>{MODE_LABELS[run.mode] ?? run.mode}</span>
      <span>{TRIGGER_LABELS[run.trigger] ?? run.trigger}</span>
      <span className="flex items-center gap-1">
        <Clock className="h-3 w-3" />
        {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}
      </span>
      {run.branch && (
        <span className="flex items-center gap-1 font-mono">
          <GitBranch className="h-3 w-3" />
          {run.branch}
        </span>
      )}
      {run.commitSha && (
        <span className="flex items-center gap-1 font-mono">
          <Hash className="h-3 w-3" />
          {run.commitSha.slice(0, 7)}
        </span>
      )}
    </div>
  );
}

function LiveResultsBar({
  passed, failed, flaky, total,
}: { passed: number; failed: number; flaky: number; total: number }) {
  const completed = passed + failed + flaky;
  if (total === 0) return null;

  const segments = [
    { count: passed, color: "bg-orbit-pass", glow: "shadow-[2px_0_8px_hsl(var(--orbit-pass)/0.4)]" },
    { count: failed, color: "bg-orbit-fail", glow: "shadow-[2px_0_8px_hsl(var(--orbit-fail)/0.4)]" },
    { count: flaky, color: "bg-orbit-flaky", glow: "shadow-[2px_0_8px_hsl(var(--orbit-flaky)/0.4)]" },
  ];

  const isProgressing = completed < total && completed > 0;

  return (
    <div className="flex h-1.5 rounded-full overflow-hidden bg-muted/30">
      {segments.map((seg, i) =>
        seg.count > 0 && (
          <motion.div
            key={i}
            className={cn(
              "h-full",
              seg.color,
              // Add glow to the last visible segment's leading edge
              isProgressing && i === segments.filter(s => s.count > 0).length - 1 && seg.glow
            )}
            initial={{ width: 0 }}
            animate={{ width: `${(seg.count / total) * 100}%` }}
            transition={progressSpring}
          />
        )
      )}
      {completed < total && (
        <div className="h-full flex-1 bg-transparent" />
      )}
    </div>
  );
}

function VerdictFilterBar({
  results, selected, onSelect,
}: { results: RunDetailData["results"]; selected: string | null; onSelect: (v: string | null) => void }) {
  const verdicts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of results) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
    return counts;
  }, [results]);

  const colors: Record<string, string> = {
    pass: "text-orbit-pass", fail: "text-orbit-fail",
    flaky: "text-orbit-flaky", healed: "text-orbit-accent", skipped: "text-muted-foreground",
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "text-xs px-2.5 py-1 rounded-md transition-colors",
          !selected ? "bg-white/[0.06] text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"
        )}
      >
        All ({results.length})
      </button>
      {Object.entries(verdicts).map(([verdict, count]) => (
        <button
          key={verdict}
          type="button"
          onClick={() => onSelect(selected === verdict ? null : verdict)}
          className={cn(
            "text-xs px-2.5 py-1 rounded-md transition-colors",
            selected === verdict ? "bg-white/[0.06]" : "hover:bg-white/[0.03]",
            colors[verdict] ?? "text-muted-foreground"
          )}
        >
          {verdict} ({count})
        </button>
      ))}
    </div>
  );
}
