"use client";

import { useEffect, useState } from "react";
import { Activity, Users, FolderOpen, Zap, TrendingUp, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface UsageData {
  tier: string;
  limits: {
    members: number;
    projects: number;
    runsPerMonth: number;
    monthlyCredits: number;
  };
  current: {
    members: number;
    projects: number;
    runsThisMonth: number;
    creditsUsedThisMonth: number;
    creditBalance: number;
  };
  dailyUsage: Array<{ date: string; runs: number }>;
  recentTransactions: Array<{
    id: string;
    type: string;
    amount: number;
    balance: number;
    description: string | null;
    createdAt: string;
  }>;
}

interface UsageDashboardProps {
  workspaceId: string;
}

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  professional: "Professional",
  enterprise: "Enterprise",
};

function UsageMeter({
  label,
  icon: Icon,
  current,
  limit,
  unit,
}: {
  label: string;
  icon: React.ElementType;
  current: number;
  limit: number;
  unit?: string;
}) {
  const isInfinite = !isFinite(limit);
  const percentage = isInfinite ? 0 : Math.min((current / limit) * 100, 100);
  const isNearLimit = percentage >= 80;
  const isAtLimit = percentage >= 100;

  return (
    <div className="p-4 rounded-xl border border-border bg-muted/30">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </div>
        <span className="text-sm font-semibold text-foreground">
          {current.toLocaleString()}
          {!isInfinite && (
            <span className="text-muted-foreground font-normal">
              {" / "}
              {limit.toLocaleString()}
              {unit && ` ${unit}`}
            </span>
          )}
          {isInfinite && (
            <span className="text-muted-foreground font-normal"> (unlimited)</span>
          )}
        </span>
      </div>
      {!isInfinite && (
        <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              isAtLimit ? "bg-red-400" : isNearLimit ? "bg-amber-400" : "bg-orbit-accent"
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function UsageDashboard({ workspaceId }: UsageDashboardProps) {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUsage() {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/usage`);
        const json = await res.json();
        if (json.success) setData(json.data);
      } finally {
        setLoading(false);
      }
    }
    fetchUsage();
  }, [workspaceId]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">Failed to load usage data.</p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tier badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-orbit-accent/15 flex items-center justify-center">
            <Zap className="h-5 w-5 text-orbit-accent" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {TIER_LABELS[data.tier] ?? data.tier} Plan
            </p>
            <p className="text-xs text-muted-foreground">
              {data.current.creditBalance.toLocaleString()} credits remaining
            </p>
          </div>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-orbit-accent bg-orbit-accent/10 hover:bg-orbit-accent/15 transition-colors">
          <ArrowUpRight className="h-3.5 w-3.5" />
          Upgrade
        </button>
      </div>

      {/* Usage meters */}
      <div className="grid grid-cols-2 gap-3">
        <UsageMeter
          label="Team Members"
          icon={Users}
          current={data.current.members}
          limit={data.limits.members}
        />
        <UsageMeter
          label="Projects"
          icon={FolderOpen}
          current={data.current.projects}
          limit={data.limits.projects}
        />
        <UsageMeter
          label="Runs This Month"
          icon={Activity}
          current={data.current.runsThisMonth}
          limit={data.limits.runsPerMonth}
        />
        <UsageMeter
          label="Credits Used"
          icon={TrendingUp}
          current={data.current.creditsUsedThisMonth}
          limit={data.limits.monthlyCredits}
        />
      </div>

      {/* Daily usage chart (simple bar chart) */}
      {data.dailyUsage.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <h4 className="text-xs font-medium text-muted-foreground mb-3">
            Runs Per Day (This Month)
          </h4>
          <div className="flex items-end gap-1 h-20">
            {data.dailyUsage.map((day) => {
              const maxRuns = Math.max(...data.dailyUsage.map((d) => d.runs), 1);
              const height = (day.runs / maxRuns) * 100;
              return (
                <div
                  key={day.date}
                  className="flex-1 bg-orbit-accent/30 hover:bg-orbit-accent/50 rounded-t transition-colors cursor-default"
                  style={{ height: `${Math.max(height, 4)}%` }}
                  title={`${day.date}: ${day.runs} runs`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Recent transactions */}
      {data.recentTransactions.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/30 overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h4 className="text-xs font-medium text-muted-foreground">
              Recent Transactions
            </h4>
          </div>
          <div className="divide-y divide-border/50">
            {data.recentTransactions.slice(0, 10).map((tx) => (
              <div key={tx.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <span className="text-sm text-foreground">
                    {tx.description ?? tx.type}
                  </span>
                  <span className="text-[11px] text-muted-foreground block">
                    {new Date(tx.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <span
                  className={cn(
                    "text-sm font-medium",
                    tx.amount < 0 ? "text-red-400" : "text-green-400"
                  )}
                >
                  {tx.amount > 0 ? "+" : ""}
                  {tx.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
