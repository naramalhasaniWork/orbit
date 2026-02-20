"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  Clock,
  Cpu,
  DollarSign,
  AlertCircle,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  type TraceNodeData,
  AGENT_PHASE_CONFIG,
  TRACE_STATUS_CONFIG,
  formatTraceTokens,
  formatTraceDuration,
  formatTraceCost,
} from "./trace-types";

interface TraceBarProps {
  trace: TraceNodeData;
  timelineStart: number;
  timelineEnd: number;
  depth?: number;
}

function ReasoningSteps({ steps }: { steps: unknown }) {
  if (!Array.isArray(steps) || steps.length === 0) return null;

  return (
    <div>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        Reasoning Steps
      </span>
      <div className="mt-2 space-y-1.5">
        {steps.map((step, i) => {
          const s = step as Record<string, unknown>;
          return (
            <div
              key={i}
              className="flex items-start gap-2 text-xs"
            >
              <span className="text-muted-foreground tabular-nums shrink-0 pt-px">
                {i + 1}.
              </span>
              <div className="flex-1 min-w-0">
                <span className="font-medium text-foreground/90">
                  {String(s.action ?? "")}
                </span>
                {s.reasoning ? (
                  <p className="text-muted-foreground mt-0.5">
                    {String(s.reasoning)}
                  </p>
                ) : null}
                {s.result ? (
                  <p className="text-orbit-accent mt-0.5">
                    {String(s.result)}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TraceDetails({ trace }: { trace: TraceNodeData }) {
  return (
    <div className="px-4 pb-4 pt-2 border-t border-white/[0.04] space-y-3">
      {trace.inputSummary && (
        <div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Input
          </span>
          <p className="text-xs text-foreground/80 mt-1">
            {trace.inputSummary}
          </p>
        </div>
      )}

      {trace.outputSummary && (
        <div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Output
          </span>
          <p className="text-xs text-foreground/80 mt-1">
            {trace.outputSummary}
          </p>
        </div>
      )}

      <ReasoningSteps steps={trace.reasoningSteps} />

      {trace.errorMessage && (
        <div className="rounded-lg bg-orbit-fail/[0.06] border-l-2 border-orbit-fail/40 py-2 pl-3 pr-4">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-orbit-fail shrink-0" />
            <span className="text-[10px] font-semibold text-orbit-fail uppercase tracking-wider">
              Error
            </span>
          </div>
          <p className="text-xs text-orbit-fail/80 mt-1 font-mono">
            {trace.errorMessage}
          </p>
        </div>
      )}

      <div className="flex items-center gap-4 text-[11px] text-muted-foreground pt-1">
        {trace.model && (
          <span className="flex items-center gap-1">
            <Cpu className="h-3 w-3" /> {trace.model}
          </span>
        )}
        {trace.temperature !== null && (
          <span>temp: {trace.temperature}</span>
        )}
        <span className="flex items-center gap-1">
          <Zap className="h-3 w-3" />
          {formatTraceTokens(trace.inputTokens)} in / {formatTraceTokens(trace.outputTokens)} out
        </span>
        {trace.cost && (
          <span className="flex items-center gap-1">
            <DollarSign className="h-3 w-3" /> {formatTraceCost(trace.cost)}
          </span>
        )}
      </div>
    </div>
  );
}

export function TraceBar({
  trace,
  timelineStart,
  timelineEnd,
  depth = 0,
}: TraceBarProps) {
  const [expanded, setExpanded] = useState(trace.status === "failed");
  const phaseConfig = AGENT_PHASE_CONFIG[trace.agentPhase];
  const statusConfig = TRACE_STATUS_CONFIG[trace.status];

  const totalDuration = timelineEnd - timelineStart;
  const traceStart = new Date(trace.startedAt).getTime();
  const traceEnd = trace.completedAt
    ? new Date(trace.completedAt).getTime()
    : Date.now();

  const leftPercent =
    totalDuration > 0
      ? Math.max(0, ((traceStart - timelineStart) / totalDuration) * 100)
      : 0;
  const widthPercent =
    totalDuration > 0
      ? Math.max(2, ((traceEnd - traceStart) / totalDuration) * 100)
      : 100;

  return (
    <div style={{ paddingLeft: depth * 24 }}>
      <div
        className={cn(
          "rounded-xl surface-1 border border-white/[0.04] overflow-hidden transition-colors mb-1.5",
          trace.status === "failed" && "border-orbit-fail/20"
        )}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-left hover:bg-white/[0.03] transition-colors"
        >
          {/* Header row */}
          <div className="flex items-center gap-3 px-4 py-2.5">
            <ChevronRight
              className={cn(
                "h-3 w-3 text-muted-foreground shrink-0 transition-transform duration-200",
                expanded && "rotate-90"
              )}
            />
            <div
              className={cn(
                "h-2 w-2 rounded-full shrink-0",
                statusConfig?.dotColor ?? "bg-muted-foreground"
              )}
            />
            <Badge
              className={cn(
                "text-[10px] px-1.5 py-0 font-medium border",
                phaseConfig?.bgColor,
                phaseConfig?.color,
                phaseConfig?.borderColor
              )}
            >
              {phaseConfig?.label ?? trace.agentPhase}
            </Badge>
            <span className="text-xs text-muted-foreground truncate flex-1">
              {trace.inputSummary ?? "Agent execution"}
            </span>
            <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
              {trace.model && (
                <span className="hidden sm:inline font-mono text-[11px]">
                  {trace.model}
                </span>
              )}
              <span className="flex items-center gap-1 tabular-nums">
                <Clock className="h-3 w-3" />
                {formatTraceDuration(trace.durationMs)}
              </span>
              {(trace.inputTokens > 0 || trace.outputTokens > 0) && (
                <span className="tabular-nums">
                  {formatTraceTokens(trace.inputTokens + trace.outputTokens)} tok
                </span>
              )}
              {trace.cost && (
                <span className="tabular-nums">
                  {formatTraceCost(trace.cost)}
                </span>
              )}
            </div>
          </div>

          {/* Timeline bar */}
          <div className="px-4 pb-2.5">
            <div className="h-1.5 rounded-full bg-white/[0.04] relative overflow-hidden">
              <motion.div
                className={cn(
                  "absolute h-full rounded-full",
                  trace.status === "failed"
                    ? "bg-orbit-fail/60"
                    : phaseConfig?.bgColor ?? "bg-orbit-accent/40"
                )}
                initial={{ width: 0, left: `${leftPercent}%` }}
                animate={{
                  width: `${widthPercent}%`,
                  left: `${leftPercent}%`,
                }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
          </div>
        </button>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <TraceDetails trace={trace} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Render child traces */}
      {trace.children.map((child) => (
        <TraceBar
          key={child.id}
          trace={child}
          timelineStart={timelineStart}
          timelineEnd={timelineEnd}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}
