"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, GitBranch, Clock, Hash, MonitorPlay, Image as ImageIcon, XCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatCard } from "@/components/shared/stat-card";
import { cn } from "@/lib/utils";
import { TestResultCard } from "@/components/runs/test-result-card";
import { FailurePatternsPanel } from "@/components/runs/failure-patterns-panel";
import { TraceViewer } from "@/components/runs/trace-viewer";
import { LiveExecutionViewer } from "@/components/execution/live-viewer";
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

function RunMeta({ run }: { run: RunDetailData }) {
  return (
    <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
      <span>{MODE_LABELS[run.mode] ?? run.mode}</span>
      <span>{TRIGGER_LABELS[run.trigger] ?? run.trigger}</span>
      <span className="flex items-center gap-1">
        <Clock className="h-3 w-3" />
        {formatDuration(run.durationMs)}
      </span>
      <span>
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

function ResultsBar({ run }: { run: RunDetailData }) {
  if (run.totalTests === 0) return null;

  const segments = [
    { count: run.passed, color: "bg-orbit-pass", label: "Passed" },
    { count: run.failed, color: "bg-orbit-fail", label: "Failed" },
    { count: run.flaky, color: "bg-orbit-flaky", label: "Flaky" },
    { count: run.skipped, color: "bg-muted-foreground", label: "Skipped" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex h-2 rounded-full overflow-hidden bg-muted">
        {segments.map(
          (seg) =>
            seg.count > 0 && (
              <div
                key={seg.label}
                className={cn("h-full transition-all", seg.color)}
                style={{ width: `${(seg.count / run.totalTests) * 100}%` }}
              />
            )
        )}
      </div>
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        {segments.map(
          (seg) =>
            seg.count > 0 && (
              <span key={seg.label} className="flex items-center gap-1.5">
                <span className={cn("h-1.5 w-1.5 rounded-full", seg.color)} />
                {seg.label} ({seg.count})
              </span>
            )
        )}
      </div>
    </div>
  );
}

function VerdictFilterBar({
  results,
  selected,
  onSelect,
}: {
  results: RunDetailData["results"];
  selected: string | null;
  onSelect: (v: string | null) => void;
}) {
  const verdicts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of results) {
      counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
    }
    return counts;
  }, [results]);

  const verdictColors: Record<string, string> = {
    pass: "text-orbit-pass",
    fail: "text-orbit-fail",
    flaky: "text-orbit-flaky",
    healed: "text-orbit-accent",
    skipped: "text-muted-foreground",
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "text-xs px-2.5 py-1 rounded-md transition-colors",
          !selected
            ? "bg-white/[0.06] text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"
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
            selected === verdict
              ? "bg-white/[0.06]"
              : "hover:bg-white/[0.03]",
            verdictColors[verdict] ?? "text-muted-foreground"
          )}
        >
          {verdict} ({count})
        </button>
      ))}
    </div>
  );
}

const LIVE_STATUSES = new Set(["queued", "executing", "indexing", "planning", "reporting"]);

export function RunDetailClient({ run, projectId }: RunDetailClientProps) {
  const router = useRouter();
  const [verdictFilter, setVerdictFilter] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const filteredResults = useMemo(() => {
    if (!verdictFilter) return run.results;
    return run.results.filter((r) => r.verdict === verdictFilter);
  }, [run.results, verdictFilter]);

  const statusConfig = RUN_STATUS_CONFIG[run.status];
  const isLive = LIVE_STATUSES.has(run.status);
  const defaultTab = isLive ? "live" : "results";

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
        router.refresh();
      }
    } catch {
      // Silently fail — user can retry
    } finally {
      setCancelling(false);
    }
  }, [projectId, run.id, cancelling, router]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-6"
    >
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
                "text-[10px] px-1.5 py-0 font-medium border",
                statusConfig?.dot === "pass" && "bg-orbit-pass/15 text-orbit-pass border-orbit-pass/30",
                statusConfig?.dot === "fail" && "bg-orbit-fail/15 text-orbit-fail border-orbit-fail/30",
                statusConfig?.dot === "running" && "bg-orbit-accent/15 text-orbit-accent border-orbit-accent/30",
                (statusConfig?.dot === "untested" || statusConfig?.dot === "skipped") && "bg-muted/50 text-muted-foreground border-border/50"
              )}
            >
              {statusConfig?.label ?? run.status}
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
            {cancelling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <XCircle className="h-3.5 w-3.5" />
            )}
            {cancelling ? "Cancelling..." : "Cancel Run"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-5 gap-3">
        <StatCard
          label="Pass Rate"
          value={run.totalTests > 0 ? `${Math.round((run.passed / run.totalTests) * 100)}%` : "--"}
        />
        <StatCard label="Passed" value={run.passed} />
        <StatCard label="Failed" value={run.failed} />
        <StatCard label="Flaky" value={run.flaky} />
        <StatCard label="Duration" value={formatDuration(run.durationMs)} />
      </div>

      <ResultsBar run={run} />

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
            Results ({run.totalTests})
          </TabsTrigger>
          <TabsTrigger value="traces">Traces</TabsTrigger>
        </TabsList>

        {isLive && (
          <TabsContent value="live" className="mt-4">
            {projectId ? (
              <LiveExecutionViewer
                projectId={projectId}
                runId={run.id}
                runStatus={run.status}
                enabled={isLive}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Project context required for live view.
              </p>
            )}
          </TabsContent>
        )}

        <TabsContent value="results" className="mt-4 space-y-4">
          <VerdictFilterBar
            results={run.results}
            selected={verdictFilter}
            onSelect={setVerdictFilter}
          />

          <div className="space-y-2">
            {filteredResults.map((result) => (
              <TestResultCard key={result.id} result={result} projectId={projectId} runId={run.id} />
            ))}
          </div>

          {projectId && run.failed > 0 && (
            <FailurePatternsPanel projectId={projectId} />
          )}
        </TabsContent>

        <TabsContent value="traces" className="mt-4">
          {projectId ? (
            <TraceViewer projectId={projectId} runId={run.id} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Project context required to view traces.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
