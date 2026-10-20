"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Status } from "@/components/telemetry/status";
import { RollingNumber } from "@/components/telemetry/rolling-number";
import { type RunDetailData, MODE_LABELS, TRIGGER_LABELS, RUN_STATUS_CONFIG } from "@/components/runs/run-types";
import { clock } from "@/lib/telemetry-format";
import type { StatusTone } from "@/lib/status-tone";

interface RunHeaderProps {
  run: RunDetailData;
  title: string;
  tone: StatusTone;
  status: string;
  completed: number;
  total: number;
  elapsedMs: number;
  previousRunId?: string;
  onCancel?: () => void;
  cancelling: boolean;
  cancelError: string | null;
}

/** Instrument readout: status · progress · elapsed, then the run's provenance and actions. */
export function RunHeader({
  run,
  title,
  tone,
  status,
  completed,
  total,
  elapsedMs,
  previousRunId,
  onCancel,
  cancelling,
  cancelError,
}: RunHeaderProps) {
  const word = RUN_STATUS_CONFIG[status]?.label ?? status;
  return (
    <header className="flex flex-wrap items-start gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1 space-y-1.5">
        <h1 className="text-balance text-[26px] font-medium leading-tight tracking-display">{title}</h1>
        <p className="tm-label flex flex-wrap items-center gap-x-2 text-tm-t2">
          <Status tone={tone} label={word} mono />
          {total > 0 && (
            <span>
              · TESTS <RollingNumber value={`${String(completed).padStart(2, "0")}/${String(total).padStart(2, "0")}`} />
            </span>
          )}
          <span>· {clock(elapsedMs)}</span>
        </p>
        <p className="tm-label flex flex-wrap gap-x-2 text-tm-t3">
          <span>{MODE_LABELS[run.mode] ?? run.mode}</span>
          <span>· {TRIGGER_LABELS[run.trigger] ?? run.trigger}</span>
          {run.prNumber && <span>· PR #{run.prNumber}</span>}
          {run.branch && <span className="normal-case">· {run.branch}</span>}
          {run.commitSha && <span className="normal-case">· {run.commitSha.slice(0, 7)}</span>}
          <span className="normal-case">· {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}</span>
        </p>
      </div>

      <div className="flex flex-col items-end gap-1.5">
        <div className="flex gap-2">
          {previousRunId && !onCancel && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/runs/compare?runA=${previousRunId}&runB=${run.id}`}>Compare with previous</Link>
            </Button>
          )}
          {onCancel && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={cancelling} aria-busy={cancelling || undefined}>
                  {cancelling ? "Stopping…" : "Stop run"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Stop this run?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The browser stops now. Tests that already finished keep their results; the rest are not run.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep running</AlertDialogCancel>
                  <AlertDialogAction onClick={onCancel}>Stop run</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
        {cancelError && (
          <span role="alert" className="max-w-[260px] text-right text-[12px] text-tm-fail">
            {cancelError}
          </span>
        )}
      </div>
    </header>
  );
}
