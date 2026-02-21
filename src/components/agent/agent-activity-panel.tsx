"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  ClipboardList,
  Play,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

interface BackgroundOperation {
  id: string;
  type: "indexing" | "planning" | "execution" | "reporting";
  status: "active" | "complete" | "error";
  label: string;
  progress: number;
  detail?: string;
  startedAt: number;
}

interface AgentActivityPanelProps {
  operations: BackgroundOperation[];
}

// ============================================================
// Constants
// ============================================================

const typeConfig: Record<
  BackgroundOperation["type"],
  { icon: LucideIcon; color: string; barColor: string }
> = {
  indexing: { icon: Search, color: "text-blue-400", barColor: "bg-blue-400" },
  planning: { icon: ClipboardList, color: "text-violet-400", barColor: "bg-violet-400" },
  execution: { icon: Play, color: "text-amber-400", barColor: "bg-amber-400" },
  reporting: { icon: FileText, color: "text-emerald-400", barColor: "bg-emerald-400" },
};

// ============================================================
// Component
// ============================================================

export function AgentActivityPanel({ operations }: AgentActivityPanelProps) {
  const hasActive = operations.some((op) => op.status === "active");

  const sorted = useMemo(() => {
    const active = operations.filter((op) => op.status === "active");
    const done = operations.filter((op) => op.status !== "active");
    return [...active, ...done];
  }, [operations]);

  return (
    <div className="w-[280px] shrink-0 flex flex-col border-l border-white/[0.06] bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.04] flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Activity
        </span>
        {hasActive && (
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 rounded-full bg-orbit-accent animate-ping opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-orbit-accent" />
          </span>
        )}
      </div>

      {/* Operation list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {sorted.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs text-muted-foreground">No active operations</span>
          </div>
        )}

        <AnimatePresence initial={false}>
          {sorted.map((op) => (
            <OperationCard key={op.id} operation={op} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ============================================================
// Operation Card
// ============================================================

function OperationCard({ operation }: { operation: BackgroundOperation }) {
  const { icon: Icon, color, barColor } = typeConfig[operation.type];
  const isActive = operation.status === "active";
  const isError = operation.status === "error";

  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: isActive ? 1 : 0.5, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 space-y-2",
        isError && "border-red-400/20",
      )}
    >
      {/* Label row */}
      <div className="flex items-center gap-2">
        <Icon className={cn("h-3.5 w-3.5 shrink-0", isError ? "text-red-400" : color)} />
        <span className="flex-1 text-xs font-medium text-foreground truncate">
          {operation.label}
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
          {operation.progress}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out",
            isError ? "bg-red-400" : barColor,
          )}
          style={{ width: `${Math.min(operation.progress, 100)}%` }}
        />
      </div>

      {/* Detail + elapsed */}
      <div className="flex items-center justify-between gap-2">
        {operation.detail ? (
          <span className="text-[10px] text-muted-foreground truncate flex-1">
            {operation.detail}
          </span>
        ) : (
          <span />
        )}
        <ElapsedTime startedAt={operation.startedAt} active={isActive} />
      </div>
    </motion.div>
  );
}

// ============================================================
// Elapsed Time
// ============================================================

function ElapsedTime({ startedAt, active }: { startedAt: number; active: boolean }) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));

  return (
    <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
      {formatElapsed(elapsed)}
    </span>
  );
}

// ============================================================
// Helpers
// ============================================================

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}
