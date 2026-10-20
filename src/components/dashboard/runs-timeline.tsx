"use client";

import React from "react";
import { StatusDot } from "@/components/shared/status-dot";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { formatDuration } from "@/components/runs/run-types";
import {
  GitBranch,
  GitPullRequest,
  Clock,
  Hand,
  Zap,
  Globe,
} from "lucide-react";
import Link from "next/link";
import { formatRunTitle } from "@/lib/runs/run-title";

interface Run {
  id: string;
  sequenceNumber: number;
  prNumber: number | null;
  status: string;
  mode: string;
  trigger: string;
  totalTests: number;
  passed: number;
  failed: number;
  flaky: number;
  durationMs: number | null;
  createdAt: Date;
}

function getRunStatus(run: Run): "pass" | "fail" | "flaky" | "running" | "untested" {
  if (run.status === "executing" || run.status === "indexing" || run.status === "planning") {
    return "running";
  }
  if (run.failed > 0) return "fail";
  if (run.flaky > 0) return "flaky";
  if (run.passed > 0) return "pass";
  return "untested";
}

const triggerIcons: Record<string, React.ElementType> = {
  push: GitBranch,
  pr: GitPullRequest,
  scheduled: Clock,
  manual: Hand,
  linear: Zap,
  api: Globe,
};

const triggerLabels: Record<string, string> = {
  push: "Push",
  pr: "PR",
  scheduled: "Scheduled",
  manual: "Manual",
  linear: "Linear",
  api: "API",
};

const modeBadgeClass: Record<string, string> = {
  full: "bg-orbit-accent/10 text-orbit-accent border-orbit-accent/20",
  smoke: "bg-orbit-flaky/10 text-orbit-flaky border-orbit-flaky/20",
  regression: "bg-orbit-fail/10 text-orbit-fail border-orbit-fail/20",
  targeted: "bg-orbit-pass/10 text-orbit-pass border-orbit-pass/20",
};

export function RunsTimeline({ runs }: { runs: Run[] }) {
  return (
    <div className="rounded-xl surface-1 border border-border h-full">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-[13px] font-medium text-foreground">Recent Runs</h2>
        <span className="text-[11px] text-muted-foreground">{runs.length} runs</span>
      </div>

      <ScrollArea className="h-[420px]">
        <div className="space-y-px">
          {runs.map((run) => {
            const status = getRunStatus(run);
            const TriggerIcon = triggerIcons[run.trigger] ?? Globe;

            return (
              <Link
                key={run.id}
                href={`/dashboard/runs/${run.id}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orbit-accent/50 focus-visible:ring-inset"
              >
                <StatusDot status={status} pulse={status === "running"} />

                <TriggerIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {formatRunTitle(run)}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 h-4 ${modeBadgeClass[run.mode] ?? ""}`}
                    >
                      {run.mode}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {triggerLabels[run.trigger] ?? run.trigger} · {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}
                    </span>
                    {run.durationMs != null && run.durationMs > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {formatDuration(run.durationMs)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs tabular-nums">
                  {run.passed > 0 && (
                    <span className="text-orbit-pass">{run.passed}</span>
                  )}
                  {run.failed > 0 && (
                    <span className="text-orbit-fail">{run.failed}</span>
                  )}
                  {run.flaky > 0 && (
                    <span className="text-orbit-flaky">{run.flaky}</span>
                  )}
                </div>

                <MiniBar run={run} />
              </Link>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function MiniBar({ run }: { run: Run }) {
  if (run.totalTests === 0) return null;

  const passWidth = (run.passed / run.totalTests) * 100;
  const failWidth = (run.failed / run.totalTests) * 100;
  const flakyWidth = (run.flaky / run.totalTests) * 100;

  return (
    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden flex">
      {passWidth > 0 && (
        <div className="bg-orbit-pass h-full" style={{ width: `${passWidth}%` }} />
      )}
      {flakyWidth > 0 && (
        <div className="bg-orbit-flaky h-full" style={{ width: `${flakyWidth}%` }} />
      )}
      {failWidth > 0 && (
        <div className="bg-orbit-fail h-full" style={{ width: `${failWidth}%` }} />
      )}
    </div>
  );
}
