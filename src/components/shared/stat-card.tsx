"use client";

import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Sparkline } from "@/components/shared/sparkline";

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: number;
  trendInverted?: boolean; // true when lower is better (e.g. flaky count)
  sparklineData?: number[];
  sparklineColor?: string;
  suffix?: string;
  className?: string;
}

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
  const trendPositive = trendInverted ? (trend ?? 0) < 0 : (trend ?? 0) > 0;
  const trendNegative = trendInverted ? (trend ?? 0) > 0 : (trend ?? 0) < 0;

  return (
    <div
      className={cn(
        "flex flex-col gap-1 p-4 rounded-xl surface-1",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
          {label}
        </span>
        {sparklineData && sparklineData.length >= 2 && (
          <Sparkline
            data={sparklineData}
            width={64}
            height={20}
            strokeColor={sparklineColor ?? "hsl(var(--orbit-accent))"}
            fillColor={sparklineColor ?? "hsl(var(--orbit-accent))"}
          />
        )}
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-semibold tabular-nums text-foreground tracking-tight">
          {value}
          {suffix && (
            <span className="text-sm font-normal text-muted-foreground ml-0.5">
              {suffix}
            </span>
          )}
        </span>
        {trend !== undefined && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-xs font-medium pb-1",
              trendPositive && "text-orbit-pass",
              trendNegative && "text-orbit-fail",
              trend === 0 && "text-muted-foreground"
            )}
          >
            {trend > 0 && <TrendingUp className="h-3 w-3" />}
            {trend < 0 && <TrendingDown className="h-3 w-3" />}
            {trend === 0 && <Minus className="h-3 w-3" />}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}
