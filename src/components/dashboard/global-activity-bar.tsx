"use client";

import { useWorkspaceActivity } from "@/hooks/use-workspace-activity";
import type { ActiveOperation } from "@/lib/dashboard/active-operations";
import { StatusDot } from "@/components/shared/status-dot";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  Loader2, ChevronRight, CheckCircle2,
  GitBranch, FlaskConical, FileSearch, FileText,
} from "lucide-react";

interface GlobalActivityBarProps {
  initialOperations?: ActiveOperation[];
}

const statusIcons: Record<string, typeof Loader2> = {
  queued: Loader2,
  indexing: GitBranch,
  planning: FileSearch,
  executing: FlaskConical,
  reporting: FileText,
};

function getOperationLink(op: ActiveOperation): string {
  if (op.type === "run") {
    return `/dashboard/runs/${op.id}?project=${op.projectId}`;
  }
  return `/dashboard?project=${op.projectId}`;
}

function OperationItem({ op }: { op: ActiveOperation }) {
  const Icon = statusIcons[op.status] ?? Loader2;
  const link = getOperationLink(op);
  const progress = op.progress;

  return (
    <Link
      href={link}
      className="group flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors min-w-0"
    >
      <StatusDot status="running" pulse size="sm" />

      <Icon className={cn(
        "h-3.5 w-3.5 text-orbit-accent shrink-0",
        op.status !== "queued" && "animate-pulse"
      )} />

      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <span className="text-xs font-medium text-foreground truncate">
          {op.projectName}
        </span>
        <span className="text-xs text-muted-foreground truncate">
          {op.label}
        </span>
      </div>

      {progress !== null && (
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-16 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-orbit-accent transition-all duration-700 ease-out"
              style={{ width: `${Math.max(progress, 3)}%` }}
            />
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground w-7 text-right">
            {progress}%
          </span>
        </div>
      )}

      <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </Link>
  );
}

export function GlobalActivityBar({ initialOperations }: GlobalActivityBarProps) {
  const { operations, hasActivity, recentlyCompleted } = useWorkspaceActivity({
    initialOperations,
  });

  if (!hasActivity && recentlyCompleted.length === 0) return null;

  return (
    <div
      className={cn(
        "border-b border-white/[0.04] bg-gradient-to-r from-orbit-accent/[0.03] to-transparent",
        "animate-fade-in"
      )}
    >
      <div className="flex items-center gap-1 px-3 py-1">
        {/* Active operations */}
        {operations.map((op) => (
          <OperationItem key={op.id} op={op} />
        ))}

        {/* Recently completed flash */}
        {recentlyCompleted.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-2 px-3 py-1.5 text-xs text-orbit-pass animate-fade-in"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="font-medium">{c.projectName}</span>
            <span className="text-muted-foreground">{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
