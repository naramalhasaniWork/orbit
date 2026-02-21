"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wrench, Check, ChevronRight, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

interface AgentToolCardProps {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: "pending" | "running" | "complete" | "error";
}

// ============================================================
// Constants
// ============================================================

const accentColors = {
  pending: "border-l-blue-400",
  running: "border-l-amber-400",
  complete: "border-l-emerald-400",
  error: "border-l-red-400",
} as const;

const iconColors = {
  pending: "text-blue-400",
  running: "text-amber-400",
  complete: "text-emerald-400",
  error: "text-red-400",
} as const;

// ============================================================
// Component
// ============================================================

export function AgentToolCard({ name, args, result, status }: AgentToolCardProps) {
  const [expanded, setExpanded] = useState(false);

  const argEntries = Object.entries(args);
  const resultJson = result !== undefined ? JSON.stringify(result, null, 2) : null;
  const resultLines = resultJson?.split("\n") ?? [];
  const truncatedResult = resultLines.length > 3 && !expanded
    ? resultLines.slice(0, 3).join("\n") + "\n..."
    : resultJson;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "relative rounded-lg border-l-2 bg-white/[0.03] border border-white/[0.06] overflow-hidden",
        accentColors[status],
      )}
    >
      {/* Running gradient sweep */}
      {status === "running" && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-0 animate-[shimmer_2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-amber-400/[0.04] to-transparent" />
        </div>
      )}

      {/* Header row */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="relative z-10 flex items-center gap-2.5 w-full px-3 py-2.5 text-left"
      >
        <Wrench className={cn("h-3.5 w-3.5 shrink-0", iconColors[status])} />

        <span className="flex-1 min-w-0 text-xs font-mono font-medium text-foreground truncate">
          {name}
        </span>

        {/* Compact arg preview when collapsed */}
        {!expanded && argEntries.length > 0 && (
          <span className="hidden sm:block text-[10px] text-muted-foreground truncate max-w-[180px]">
            {argEntries.slice(0, 2).map(([k, v]) => `${k}=${formatValue(v)}`).join(" ")}
            {argEntries.length > 2 && ` +${argEntries.length - 2}`}
          </span>
        )}

        {/* Status indicator */}
        <AnimatePresence mode="wait">
          {status === "complete" && (
            <motion.div
              key="check"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25 }}
            >
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            </motion.div>
          )}
          {status === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25 }}
            >
              <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
            </motion.div>
          )}
          {status === "running" && (
            <motion.div
              key="running"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="h-2 w-2 rounded-full bg-amber-400"
            />
          )}
        </AnimatePresence>

        <ChevronRight
          className={cn(
            "h-3 w-3 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-90",
          )}
        />
      </button>

      {/* Expandable detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2 border-t border-white/[0.04] pt-2">
              {/* Args */}
              {argEntries.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                    Arguments
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {argEntries.map(([key, val]) => (
                      <span
                        key={key}
                        className="inline-flex text-[10px] font-mono bg-white/[0.05] rounded px-1.5 py-0.5 text-muted-foreground"
                      >
                        <span className="text-foreground/70">{key}</span>
                        <span className="mx-0.5">=</span>
                        <span className="text-foreground/50 max-w-[120px] truncate">{formatValue(val)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Result */}
              {resultJson && (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                    Result
                  </span>
                  <pre className="text-[10px] font-mono leading-relaxed text-foreground/60 bg-white/[0.03] rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all">
                    {truncatedResult}
                  </pre>
                  {resultLines.length > 3 && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
                      className="text-[10px] text-orbit-accent hover:underline"
                    >
                      {resultLines.length} lines total
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ============================================================
// Helpers
// ============================================================

function formatValue(value: unknown): string {
  if (typeof value === "string") return value.length > 30 ? value.slice(0, 30) + "..." : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return "null";
  return JSON.stringify(value).slice(0, 30);
}
