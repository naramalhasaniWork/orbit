"use client";

import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/shared/sparkline";
import { RollingNumber } from "@/components/telemetry/rolling-number";

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: number;
  trendInverted?: boolean;
  sparklineData?: number[];
  sparklineColor?: string;
  suffix?: string;
  className?: string;
}

/** Stat-strip cell: Martian Mono label and numeral, hairline border, no lift or glow. */
export function StatCard({
  label,
  value,
  trend,
  trendInverted,
  sparklineData,
  sparklineColor,
  suffix,
  className,
}: StatCardProps) {
  const good = trendInverted ? (trend ?? 0) < 0 : (trend ?? 0) > 0;
  const bad = trendInverted ? (trend ?? 0) > 0 : (trend ?? 0) < 0;

  return (
    <div
      className={cn(
        "flex min-h-[88px] flex-col gap-2 rounded-lg border border-border bg-card p-4",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="tm-label truncate text-tm-t3">{label}</span>
        {sparklineData && sparklineData.length >= 2 && (
          <Sparkline
            data={sparklineData}
            width={64}
            height={20}
            strokeColor={sparklineColor ?? "hsl(var(--tm-t3))"}
          />
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="tm-num text-[26px] leading-none tracking-[-0.02em] text-foreground">
          <RollingNumber value={value} />
          {suffix && <span className="ml-0.5 text-sm text-tm-t3">{suffix}</span>}
        </span>
        {trend !== undefined && (
          <span
            className={cn(
              "tm-num text-[11px]",
              good && "text-tm-pass",
              bad && "text-tm-fail",
              !good && !bad && "text-tm-t3"
            )}
          >
            <span aria-hidden="true">{trend > 0 ? "▲" : trend < 0 ? "▼" : "–"}</span>
            <span className="sr-only">{trend > 0 ? "up" : trend < 0 ? "down" : "unchanged"}</span>{" "}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}
