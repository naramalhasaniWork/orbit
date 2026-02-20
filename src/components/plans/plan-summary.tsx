"use client";

import { Badge } from "@/components/ui/badge";
import {
  type PlanSummaryStats,
  TEST_TYPE_CONFIG,
} from "@/components/plans/plan-types";

interface PlanSummaryProps {
  stats: PlanSummaryStats;
}

export function PlanSummary({ stats }: PlanSummaryProps) {
  return (
    <div className="px-5 py-4 bg-muted/20 border-b border-border space-y-3">
      <div className="grid grid-cols-4 gap-3">
        <MiniStat
          label="Total Cases"
          value={stats.total}
          color="text-foreground"
        />
        <MiniStat
          label="Enabled"
          value={stats.enabled}
          color="text-orbit-pass"
        />
        <MiniStat
          label="Critical"
          value={stats.critical}
          color="text-orbit-fail"
        />
        <MiniStat
          label="High Priority"
          value={stats.highPriority}
          color="text-orbit-flaky"
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Types
        </span>
        {Object.entries(stats.byType).map(([type, count]) => {
          const config = TEST_TYPE_CONFIG[type];
          return (
            <Badge
              key={type}
              className={`text-[10px] px-1.5 py-0 font-medium border ${config?.className ?? "bg-muted/50 text-muted-foreground border-border/50"}`}
            >
              {config?.label ?? type} {count}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </span>
      <span className={`text-lg font-semibold tabular-nums ${color}`}>
        {value}
      </span>
    </div>
  );
}
