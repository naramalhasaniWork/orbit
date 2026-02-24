"use client";

import { useWorkspaceActivity } from "@/hooks/use-workspace-activity";
import type { ActiveOperation, OperationKind } from "@/lib/dashboard/active-operations";
import { StatusDot } from "@/components/shared/status-dot";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  Loader2, ChevronRight, CheckCircle2,
  GitBranch, FlaskConical, FileSearch, FileText,
  ShieldCheck, Eye,
} from "lucide-react";

interface GlobalActivityBarProps {
  initialOperations?: ActiveOperation[];
}

/** Default icon per run status */
const statusIcons: Record<string, typeof Loader2> = {
  queued: Loader2,
  indexing: GitBranch,
  planning: FileSearch,
  executing: FlaskConical,
  reporting: FileText,
};

/** Override icon by operation kind (used during executing phase) */
const kindIcons: Partial<Record<OperationKind, typeof Loader2>> = {
  security_audit: ShieldCheck,
  visual_test: Eye,
};

/** Human-readable mode badge labels */
const modeBadgeLabels: Record<string, string> = {
  full: "Full",
  smoke: "Smoke",
  regression: "Regression",
  targeted: "Targeted",
};

function getOperationLink(op: ActiveOperation): string {
  if (op.type === "run") {
    return `/dashboard/runs/${op.id}?project=${op.projectId}`;
  }
  return `/dashboard?project=${op.projectId}`;
}

function resolveIcon(op: ActiveOperation): typeof Loader2 {
  // Use kind-specific icon for active phases (executing, planning)
  if (op.kind !== "test" && op.kind !== "indexing") {
    const kindIcon = kindIcons[op.kind];
    if (kindIcon && (op.status === "executing" || op.status === "planning")) {
      return kindIcon;
    }
  }
  return statusIcons[op.status] ?? Loader2;
}

function OperationItem({ op }: { op: ActiveOperation }) {
  const Icon = resolveIcon(op);
  const link = getOperationLink(op);
  const progress = op.progress;
  const modeBadge = op.mode ? modeBadgeLabels[op.mode] : null;
  const isSecurityAudit = op.kind === "security_audit";

  return (
    <Link
      href={link}
      className="group flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors min-w-0"
    >
      <StatusDot status="running" pulse size="sm" />

      <Icon className={cn(
        "h-3.5 w-3.5 shrink-0",
        isSecurityAudit ? "text-amber-400" : "text-orbit-accent",
        op.status !== "queued" && "animate-pulse"
      )} />

      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {modeBadge && (
          <span className={cn(
            "text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0",
            isSecurityAudit
              ? "bg-amber-400/10 text-amber-400"
              : "bg-orbit-accent/10 text-orbit-accent"
          )}>
            {isSecurityAudit ? "Audit" : modeBadge}
          </span>
        )}
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
              className={cn(
                "h-full rounded-full transition-all duration-700 ease-out",
                isSecurityAudit ? "bg-amber-400" : "bg-orbit-accent"
              )}
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
