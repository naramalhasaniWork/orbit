"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { SelectCheckbox } from "@/components/shared/select-checkbox";
import { Status } from "@/components/telemetry/status";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { formatRunTitle } from "@/lib/runs/run-title";
import { runWord, toneForRun } from "@/lib/status-tone";
import {
  type RunListItem,
  RUN_STATUS_CONFIG,
  MODE_LABELS,
  TRIGGER_LABELS,
  formatDuration,
} from "@/components/runs/run-types";

interface RunRowProps {
  run: RunListItem;
  selected: boolean;
  onToggleSelect: (shift: boolean) => void;
}

/** One run: status (glyph + word), title, provenance, counts, duration. */
export function RunRow({ run, selected, onToggleSelect }: RunRowProps) {
  const title = formatRunTitle(run);
  const tone = toneForRun(run.status, run);
  const word = run.status === "completed" ? runWord(run.status, run) : RUN_STATUS_CONFIG[run.status]?.label ?? run.status;

  return (
    <div className={cn("flex items-center transition-colors", selected ? "bg-accent" : "hover:bg-accent/60")}>
      <div className="py-3 pl-4 pr-1">
        <SelectCheckbox checked={selected} onToggle={onToggleSelect} label={`Select ${title}`} />
      </div>
      <Link
        href={`/dashboard/runs/${run.id}`}
        className="grid min-w-0 flex-1 grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-4 py-3 pl-3 pr-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[96px_minmax(0,1fr)_auto_64px]"
      >
        <Status tone={tone} label={word} mono />
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-foreground">{title}</span>
          {/* Inline text so it ends in an ellipsis; below sm only trigger and age. */}
          <span className="tm-label mt-0.5 block truncate text-tm-t3">
            {run.triggeredBy && (
              <Avatar
                name={run.triggeredBy.name}
                email={run.triggeredBy.email}
                image={run.triggeredBy.image}
                size="xs"
                className="mr-1.5 align-[-4px]"
              />
            )}
            {TRIGGER_LABELS[run.trigger] ?? run.trigger}
            <span className="hidden sm:inline"> · {MODE_LABELS[run.mode] ?? run.mode}</span>
            {run.branch && <span className="hidden normal-case sm:inline"> · {run.branch}</span>}
            {run.commitSha && <span className="hidden normal-case sm:inline"> · {run.commitSha.slice(0, 7)}</span>}
            <span className="normal-case"> · {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}</span>
          </span>
        </span>
        <TestCounts run={run} />
        <span className="tm-num hidden text-right text-[10.5px] text-tm-t2 sm:block">{formatDuration(run.durationMs)}</span>
      </Link>
    </div>
  );
}

function TestCounts({ run }: { run: RunListItem }) {
  if (run.totalTests === 0) return <span className="tm-num text-[10.5px] text-tm-t3">–</span>;
  return (
    <span className="tm-num flex items-center justify-end gap-2.5 text-[10.5px]">
      {run.passed > 0 && <span className="text-tm-pass"><span aria-hidden="true">✓</span> {run.passed}<span className="sr-only"> passed</span></span>}
      {run.failed > 0 && <span className="text-tm-fail"><span aria-hidden="true">✕</span> {run.failed}<span className="sr-only"> failed</span></span>}
      {run.flaky > 0 && <span className="text-tm-flaky"><span aria-hidden="true">◐</span> {run.flaky}<span className="sr-only"> flaky</span></span>}
      {run.skipped > 0 && <span className="text-tm-t3"><span aria-hidden="true">–</span> {run.skipped}<span className="sr-only"> skipped</span></span>}
    </span>
  );
}
