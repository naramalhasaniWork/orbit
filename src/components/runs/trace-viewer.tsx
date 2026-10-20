"use client";

import { Pending } from "@/components/telemetry/pending";
import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Activity } from "lucide-react";
import {
  type TraceNodeData,
  AGENT_PHASE_CONFIG,
  formatTraceTokens,
  formatTraceDuration,
  formatTraceCost,
} from "./trace-types";
import { TraceBar } from "./trace-bar";

interface TraceViewerProps {
  projectId: string;
  runId: string;
}

function TraceSummary({ traces }: { traces: TraceNodeData[] }) {
  const stats = useMemo(() => {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;
    let totalDuration = 0;
    const phaseStats: Record<string, { count: number; durationMs: number }> = {};

    function walk(nodes: TraceNodeData[]) {
      for (const node of nodes) {
        totalInputTokens += node.inputTokens;
        totalOutputTokens += node.outputTokens;
        totalCost += node.cost ? parseFloat(node.cost) : 0;
        totalDuration += node.durationMs ?? 0;

        const existing = phaseStats[node.agentPhase] ?? { count: 0, durationMs: 0 };
        existing.count += 1;
        existing.durationMs += node.durationMs ?? 0;
        phaseStats[node.agentPhase] = existing;

        walk(node.children);
      }
    }
    walk(traces);

    return { totalInputTokens, totalOutputTokens, totalCost, totalDuration, phaseStats };
  }, [traces]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      <SummaryStat
        label="Total Duration"
        value={formatTraceDuration(stats.totalDuration)}
      />
      <SummaryStat
        label="Input Tokens"
        value={formatTraceTokens(stats.totalInputTokens)}
      />
      <SummaryStat
        label="Output Tokens"
        value={formatTraceTokens(stats.totalOutputTokens)}
      />
      <SummaryStat
        label="Total Cost"
        value={formatTraceCost(stats.totalCost > 0 ? String(stats.totalCost) : null)}
      />
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 p-3 rounded-lg surface-1 border border-border">
      <span className=" text-muted-foreground tm-label">
        {label}
      </span>
      <span className="text-lg font-medium tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

function PhaseLegend() {
  const phases = Object.entries(AGENT_PHASE_CONFIG);

  return (
    <div className="flex items-center gap-3 mb-4 flex-wrap">
      {phases.map(([key, config]) => (
        <div key={key} className="flex items-center gap-1.5">
          <div className={`h-2 w-2 rounded-full ${config.bgColor}`} />
          <span className={`text-[11px] font-medium ${config.color}`}>
            {config.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl surface-1 border border-border p-12 text-center">
      <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
      <p className="text-sm text-muted-foreground">
        No execution traces available for this run.
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        Traces are recorded when a run executes through the pipeline.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="rounded-xl surface-1 border border-border p-12 text-center">
      <Pending />
      <p className="text-sm text-muted-foreground">Loading traces...</p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl surface-1 border border-orbit-fail/20 p-8 text-center">
      <p className="text-sm text-orbit-fail">{message}</p>
    </div>
  );
}

export function TraceViewer({ projectId, runId }: TraceViewerProps) {
  const [traces, setTraces] = useState<TraceNodeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTraces() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(
          `/api/projects/${projectId}/runs/${runId}/traces`
        );
        if (!res.ok) {
          throw new Error(`Failed to fetch traces: ${res.status}`);
        }
        const json = await res.json() as { success: boolean; data: TraceNodeData[] };
        if (json.success) {
          setTraces(json.data);
        } else {
          throw new Error("Failed to load trace data");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(msg);
      } finally {
        setLoading(false);
      }
    }

    fetchTraces();
  }, [projectId, runId]);

  const { timelineStart, timelineEnd } = useMemo(() => {
    if (traces.length === 0) return { timelineStart: 0, timelineEnd: 0 };

    let earliest = Infinity;
    let latest = 0;

    function walk(nodes: TraceNodeData[]) {
      for (const node of nodes) {
        const start = new Date(node.startedAt).getTime();
        const end = node.completedAt
          ? new Date(node.completedAt).getTime()
          : Date.now();
        if (start < earliest) earliest = start;
        if (end > latest) latest = end;
        walk(node.children);
      }
    }
    walk(traces);

    return { timelineStart: earliest, timelineEnd: latest };
  }, [traces]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (traces.length === 0) return <EmptyState />;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="space-y-2"
    >
      <TraceSummary traces={traces} />
      <PhaseLegend />

      <div className="space-y-0">
        {traces.map((trace) => (
          <TraceBar
            key={trace.id}
            trace={trace}
            timelineStart={timelineStart}
            timelineEnd={timelineEnd}
          />
        ))}
      </div>
    </motion.div>
  );
}
