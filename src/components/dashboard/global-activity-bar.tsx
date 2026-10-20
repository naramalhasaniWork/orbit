"use client";

import { useWorkspaceActivity } from "@/hooks/use-workspace-activity";
import type { ActiveOperation, OperationKind } from "@/lib/dashboard/active-operations";
import { StatusDot } from "@/components/shared/status-dot";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  Loader2, ChevronRight,
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
  const isExecuting = op.status === "executing";
  const passed = (op.meta?.passed as number | undefined) ?? 0;
  const failed = (op.meta?.failed as number | undefined) ?? 0;
  const total = (op.meta?.totalTests as number | undefined) ?? 0;

  return (
    <Link
      href={link}
      className="group flex h-8 min-w-0 items-center gap-2.5 rounded-md px-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <StatusDot status="running" size="sm" />

      <Icon aria-hidden="true" className="size-3.5 shrink-0 text-tm-t2" strokeWidth={1.6} />

      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {modeBadge && (
          <span className="tm-label shrink-0 text-tm-t3">
            {isSecurityAudit ? "Audit" : modeBadge}
          </span>
        )}
        <span className="text-xs font-medium text-foreground truncate">
          {op.projectName}
        </span>
        <span className="text-xs text-muted-foreground truncate">
          {op.label}
        </span>
        {isExecuting && total > 0 && (
          <span className="tm-num shrink-0 text-[10.5px] text-tm-t2">
            {passed + failed}/{total}
          </span>
        )}
      </div>

      {isExecuting && total > 0 && (passed > 0 || failed > 0) && (
        <div className="tm-num flex shrink-0 items-center gap-1.5 text-[10.5px]">
          {passed > 0 && <span className="text-tm-pass">✓ {passed}</span>}
          {failed > 0 && <span className="text-tm-fail">✕ {failed}</span>}
        </div>
      )}

      {progress !== null && (
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Progress is scaleX from the left: transform only, never width. */}
          <div aria-hidden="true" className="relative h-0.5 w-20 overflow-hidden bg-tm-line">
            {isExecuting && total > 0 ? (
              <>
                <div
                  className="absolute inset-0 origin-left bg-tm-pass transition-transform duration-change"
                  style={{ transform: `scaleX(${passed / total})` }}
                />
                <div
                  className="absolute inset-0 origin-left bg-tm-fail transition-transform duration-change"
                  style={{ transform: `translateX(${(passed / total) * 100}%) scaleX(${failed / total})` }}
                />
              </>
            ) : (
              <div
                className="absolute inset-0 origin-left bg-tm-live transition-transform duration-change"
                style={{ transform: `scaleX(${Math.max(progress, 3) / 100})` }}
              />
            )}
          </div>
          <span className="tm-num w-8 text-right text-[10.5px] text-tm-t2">
            {progress}%
          </span>
        </div>
      )}

      <ChevronRight aria-hidden="true" className="size-3 shrink-0 text-tm-t3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
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
        "border-b border-border"
      )}
    >
      <div className="flex items-center gap-1 overflow-x-auto px-2 py-1">
        {/* Active operations */}
        {operations.map((op) => (
          <OperationItem key={op.id} op={op} />
        ))}

        {/* Recently completed flash */}
        {recentlyCompleted.map((c) => (
          <div
            key={c.id}
            role="status"
            className="flex h-8 items-center gap-2 px-3 text-xs text-tm-t2"
          >
            <span aria-hidden="true" className="font-label text-tm-t3">–</span>
            <span className="font-medium">{c.projectName}</span>
            <span className="text-muted-foreground">{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
