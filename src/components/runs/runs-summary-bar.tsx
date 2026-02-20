"use client";

import { useMemo } from "react";
import { type RunListItem } from "@/components/runs/run-types";

interface RunsSummaryBarProps {
  runs: RunListItem[];
}

export function RunsSummaryBar({ runs }: RunsSummaryBarProps) {
  const counts = useMemo(() => {
    const inProgress = new Set(["queued", "indexing", "planning", "executing", "reporting"]);
    let running = 0;
    let completed = 0;
    let failed = 0;
    let cancelled = 0;

    for (const run of runs) {
      if (inProgress.has(run.status)) running++;
      else if (run.status === "completed") completed++;
      else if (run.status === "failed") failed++;
      else if (run.status === "cancelled") cancelled++;
    }

    return { running, completed, failed, cancelled };
  }, [runs]);

  if (runs.length === 0) return null;

  return (
    <div className="flex items-center gap-6 px-4 py-3 rounded-xl surface-1">
      <SummaryItem
        label="Running"
        count={counts.running}
        dotClass="bg-orbit-accent"
      />
      <SummaryItem
        label="Completed"
        count={counts.completed}
        dotClass="bg-orbit-pass"
      />
      <SummaryItem
        label="Failed"
        count={counts.failed}
        dotClass="bg-orbit-fail"
      />
      <SummaryItem
        label="Cancelled"
        count={counts.cancelled}
        dotClass="bg-muted-foreground"
      />
    </div>
  );
}

function SummaryItem({
  label,
  count,
  dotClass,
}: {
  label: string;
  count: number;
  dotClass: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${dotClass}`} />
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground tabular-nums">
        {count}
      </span>
    </div>
  );
}
