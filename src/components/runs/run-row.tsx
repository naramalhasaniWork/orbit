"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/shared/status-dot";
import { SelectCheckbox } from "@/components/shared/select-checkbox";
import { cn } from "@/lib/utils";
import { formatRunTitle } from "@/lib/runs/run-title";
import {
  type RunListItem,
  RUN_STATUS_CONFIG,
  MODE_LABELS,
  TRIGGER_LABELS,
  formatDuration,
  getRunVerdictStatus,
} from "@/components/runs/run-types";

interface RunRowProps {
  run: RunListItem;
  selected: boolean;
  onToggleSelect: (shift: boolean) => void;
}

const MUTED_BADGE = "bg-muted/50 text-muted-foreground border-border/50";

export function RunRow({ run, selected, onToggleSelect }: RunRowProps) {
  const statusConfig = RUN_STATUS_CONFIG[run.status];
  const verdictStatus = getRunVerdictStatus(run);
  const isInProgress = verdictStatus === "running";
  const title = formatRunTitle(run);

  return (
    <div
      className={cn(
        "flex items-center transition-colors duration-150",
        selected ? "bg-orbit-accent/[0.06]" : "hover:bg-white/[0.04]"
      )}
    >
      <div className="pl-5 pr-1 py-3.5">
        <SelectCheckbox checked={selected} onToggle={onToggleSelect} label={`Select ${title}`} />
      </div>
      <Link
        href={`/dashboard/runs/${run.id}`}
        className="flex flex-1 min-w-0 items-center gap-4 pl-3 pr-5 py-3.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orbit-accent/50 focus-visible:ring-inset"
      >
        <StatusDot status={statusConfig?.dot ?? "untested"} pulse={isInProgress} size="md" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground tabular-nums">{title}</span>
            <Badge className={cn("text-[10px] px-1.5 py-0 font-medium border", MUTED_BADGE)}>
              {TRIGGER_LABELS[run.trigger] ?? run.trigger}
            </Badge>
            <Badge className={cn("text-[10px] px-1.5 py-0 font-medium border", MUTED_BADGE)}>
              {MODE_LABELS[run.mode] ?? run.mode}
            </Badge>
            <Badge
              className={cn(
                "text-[10px] px-1.5 py-0 font-medium border",
                statusConfig?.dot === "pass" && "bg-orbit-pass/15 text-orbit-pass border-orbit-pass/30",
                statusConfig?.dot === "fail" && "bg-orbit-fail/15 text-orbit-fail border-orbit-fail/30",
                statusConfig?.dot === "running" && "bg-orbit-accent/15 text-orbit-accent border-orbit-accent/30",
                (statusConfig?.dot === "untested" || statusConfig?.dot === "skipped" || !statusConfig) && MUTED_BADGE
              )}
            >
              {statusConfig?.label ?? run.status}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span>{formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}</span>
            {run.branch && <span className="font-mono truncate max-w-[120px]">{run.branch}</span>}
            {run.commitSha && <span className="font-mono">{run.commitSha.slice(0, 7)}</span>}
          </div>
        </div>

        <TestCountsDisplay run={run} />

        <span className="hidden sm:block text-xs text-muted-foreground tabular-nums w-16 text-right">
          {formatDuration(run.durationMs)}
        </span>

        <ArrowRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors duration-150 shrink-0" />
      </Link>
    </div>
  );
}

function TestCountsDisplay({ run }: { run: RunListItem }) {
  if (run.totalTests === 0) {
    return <span className="text-xs text-muted-foreground w-28 text-right">--</span>;
  }

  return (
    <div className="flex items-center gap-2 text-xs tabular-nums w-28 justify-end">
      {run.passed > 0 && <span className="text-orbit-pass">{run.passed}P</span>}
      {run.failed > 0 && <span className="text-orbit-fail">{run.failed}F</span>}
      {run.flaky > 0 && <span className="text-orbit-flaky">{run.flaky}Fl</span>}
      {run.skipped > 0 && <span className="text-muted-foreground">{run.skipped}S</span>}
    </div>
  );
}
