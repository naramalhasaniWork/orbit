"use client";

import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  SkipForward,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { springs, progressSpring } from "@/lib/motion";
import type { TestItem } from "@/hooks/use-run-events";

interface TestTimelinePanelProps {
  tests: TestItem[];
  totalTests: number;
  className?: string;
}

export function TestTimelinePanel({
  tests,
  totalTests,
  className,
}: TestTimelinePanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const completed = tests.filter((t) => t.status !== "running").length;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [tests.length]);

  return (
    <div
      className={cn(
        "flex flex-col bg-[hsl(var(--orbit-bg-deeper,222_47%_6%))]",
        "border-l border-white/[0.06] overflow-hidden",
        className
      )}
    >
      <div className="px-3 py-2 border-b border-white/[0.04] shrink-0 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Test Timeline
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {completed}
          {totalTests > 0 && ` / ${totalTests}`}
        </span>
      </div>

      {/* Progress micro-bar */}
      {totalTests > 0 && (
        <div className="h-0.5 bg-white/[0.04] shrink-0 overflow-hidden">
          <motion.div
            className="h-full bg-orbit-accent shadow-[2px_0_6px_hsl(var(--orbit-accent)/0.5)]"
            initial={{ width: 0 }}
            animate={{ width: `${(completed / totalTests) * 100}%` }}
            transition={progressSpring}
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-1.5 py-1.5 space-y-0.5">
        {tests.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <Loader2 className="h-4 w-4 text-orbit-accent animate-spin" />
            <span className="text-[11px] text-muted-foreground">
              Waiting for first test...
            </span>
          </div>
        )}

        <AnimatePresence initial={false}>
          {tests.map((test, i) => (
            <TestEntry key={test.testCaseId} test={test} index={i} />
          ))}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function TestEntry({ test, index }: { test: TestItem; index: number }) {
  const isRunning = test.status === "running";

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={springs.smooth}
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors group",
        isRunning && "bg-orbit-accent/[0.06]",
        test.status === "failed" && "bg-orbit-fail/[0.04]"
      )}
    >
      <span className="text-[9px] tabular-nums text-muted-foreground/50 w-4 text-right shrink-0">
        {index + 1}
      </span>

      <VerdictIcon status={test.status} />

      <span
        className={cn(
          "text-[11px] flex-1 min-w-0 truncate leading-tight",
          isRunning && "text-foreground",
          test.status === "passed" && "text-foreground/60",
          test.status === "healed" && "text-foreground/60",
          test.status === "failed" && "text-orbit-fail",
          test.status === "flaky" && "text-orbit-flaky",
          test.status === "skipped" && "text-muted-foreground"
        )}
      >
        {test.testCaseName}
      </span>

      {test.durationMs != null && (
        <span className="text-[9px] tabular-nums text-muted-foreground/50 shrink-0">
          {formatMs(test.durationMs)}
        </span>
      )}

      {isRunning && (
        <div className="flex items-center gap-0.5 shrink-0">
          {[0, 1, 2].map((dot) => (
            <motion.div
              key={dot}
              className="h-1 w-1 rounded-full bg-orbit-accent"
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: dot * 0.15,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}

function VerdictIcon({ status }: { status: TestItem["status"] }) {
  const s = "h-3 w-3 shrink-0";

  switch (status) {
    case "running":
      return <Loader2 className={cn(s, "text-orbit-accent animate-spin")} />;
    case "passed":
    case "healed":
      return <CheckCircle2 className={cn(s, "text-orbit-pass")} />;
    case "failed":
      return <XCircle className={cn(s, "text-orbit-fail")} />;
    case "flaky":
      return <AlertTriangle className={cn(s, "text-orbit-flaky")} />;
    case "skipped":
      return <SkipForward className={cn(s, "text-muted-foreground")} />;
    default:
      return <div className={cn(s, "rounded-full border border-white/10")} />;
  }
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}
