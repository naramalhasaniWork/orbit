"use client";

import { Check, Loader2, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { PlanJobState } from "@/lib/websocket/channels";

const PHASE_LABELS: Record<string, string> = {
  coverage: "Analyzing Coverage",
  journeys: "Mapping User Journeys",
  generating: "Generating Test Cases",
  prioritizing: "Prioritizing Tests",
  saving: "Saving Plan",
  complete: "Complete",
};

const PHASE_ORDER = ["coverage", "journeys", "generating", "prioritizing", "saving", "complete"];

/** Live progress of a background plan generation (see usePlanGeneration). */
export function PlanGenerationProgress({
  job,
  error,
}: {
  job: PlanJobState | null;
  error: string | null;
}) {
  const complete = job?.status === "completed";
  const currentPhaseIdx = job ? PHASE_ORDER.indexOf(job.phase) : -1;
  const progress = job?.progress ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-xl border border-border bg-foreground/[0.02] p-5 space-y-4"
    >
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground font-medium">
            {error ? "Generation Failed" : job?.message ?? "Starting..."}
          </span>
          <span className="text-muted-foreground tabular-nums">{progress}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-foreground/[0.06] overflow-hidden">
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
                !isDone && !isCurrent && "bg-foreground/[0.02] text-muted-foreground/50"
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
