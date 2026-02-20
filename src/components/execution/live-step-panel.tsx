"use client";

import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

export interface LiveStep {
  stepIndex: number;
  testCaseId: string;
  action: string;
  status: "running" | "passed" | "failed";
  durationMs?: number;
  error?: string;
}

interface LiveStepPanelProps {
  steps: LiveStep[];
  activeStepIndex: number | null;
  className?: string;
}

// ============================================================
// Component
// ============================================================

export function LiveStepPanel({
  steps,
  activeStepIndex,
  className,
}: LiveStepPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to follow active step
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [steps.length, activeStepIndex]);

  return (
    <div
      className={cn(
        "flex flex-col bg-[hsl(var(--orbit-bg-deeper,222_47%_6%))]",
        "border-l border-white/[0.06] overflow-hidden",
        className
      )}
    >
      {/* Panel header */}
      <div className="px-3 py-2 border-b border-white/[0.04] shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Step Log
        </span>
        <span className="ml-2 text-[10px] tabular-nums text-muted-foreground">
          ({steps.length})
        </span>
      </div>

      {/* Step list */}
      <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-0.5">
        {steps.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs text-muted-foreground">
              Waiting for steps...
            </span>
          </div>
        )}

        <AnimatePresence initial={false}>
          {steps.map((step) => (
            <StepEntry
              key={`${step.testCaseId}-${step.stepIndex}`}
              step={step}
              isActive={step.stepIndex === activeStepIndex}
            />
          ))}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ============================================================
// Step Entry
// ============================================================

function StepEntry({
  step,
  isActive,
}: {
  step: LiveStep;
  isActive: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "flex items-start gap-2 px-2 py-1.5 rounded-md transition-colors",
        isActive && "bg-white/[0.04]",
        step.status === "failed" && "bg-orbit-fail/[0.06]"
      )}
    >
      <div className="shrink-0 mt-0.5">
        <StepStatusIcon status={step.status} isActive={isActive} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
            {step.stepIndex + 1}.
          </span>
          <span
            className={cn(
              "text-xs truncate",
              step.status === "passed" && "text-foreground/80",
              step.status === "failed" && "text-orbit-fail",
              step.status === "running" && "text-foreground"
            )}
          >
            {step.action}
          </span>
        </div>

        {step.error && (
          <details className="mt-1">
            <summary className="text-[10px] text-orbit-fail cursor-pointer flex items-center gap-1">
              <ChevronDown className="h-2.5 w-2.5" />
              Error details
            </summary>
            <p className="text-[10px] text-orbit-fail/80 mt-0.5 pl-3.5 leading-relaxed break-all">
              {step.error}
            </p>
          </details>
        )}
      </div>

      {step.durationMs !== undefined && (
        <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
          {formatMs(step.durationMs)}
        </span>
      )}
    </motion.div>
  );
}

// ============================================================
// Helpers
// ============================================================

function StepStatusIcon({
  status,
  isActive,
}: {
  status: "running" | "passed" | "failed";
  isActive: boolean;
}) {
  const size = "h-3.5 w-3.5";

  if (status === "running" || (isActive && status !== "failed")) {
    return <Loader2 className={cn(size, "text-orbit-accent animate-spin")} />;
  }
  if (status === "passed") {
    return <CheckCircle2 className={cn(size, "text-orbit-pass")} />;
  }
  return <XCircle className={cn(size, "text-orbit-fail")} />;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
