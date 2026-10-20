"use client";

import { Cpu, TrendingUp } from "lucide-react";

interface ModelUsageEntry {
  id: string;
  provider: string;
  displayName: string;
  usage: { totalTokens: number; calls: number };
}

interface ModelUsageStatsProps {
  models: ModelUsageEntry[];
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000_000) return `${(tokens / 1_000_000_000).toFixed(1)}B`;
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}

export function ModelUsageStats({ models }: ModelUsageStatsProps) {
  const topByUsage = [...models]
    .filter((m) => m.usage.totalTokens > 0)
    .sort((a, b) => b.usage.totalTokens - a.usage.totalTokens)
    .slice(0, 10);

  if (topByUsage.length === 0) return null;

  return (
    <div className="rounded-xl surface-1 border border-border p-5 space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-foreground" />
        <h3 className="text-sm font-medium text-foreground">
          Top Models by Usage (Last 30 Days)
        </h3>
      </div>
      <div className="space-y-2">
        {topByUsage.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between py-1.5"
          >
            <div className="flex items-center gap-2">
              <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm text-foreground">
                {m.displayName}
              </span>
              <span className="text-xs text-muted-foreground">
                ({m.provider})
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>{formatTokens(m.usage.totalTokens)} tokens</span>
              <span>{m.usage.calls} calls</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
