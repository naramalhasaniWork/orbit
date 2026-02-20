"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, DollarSign, Cpu, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

interface TokenUsageData {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  byModel: Record<string, { cost: number; calls: number }>;
  byAgent: Record<string, { cost: number; calls: number }>;
}

interface BudgetData {
  currentCost: number;
  budgetLimit: number | null;
  usagePercent: number;
  isNearLimit: boolean;
  isOverLimit: boolean;
  creditsUsed: number;
  creditsLimit: number;
  creditsPercent: number;
}

interface DailyCost {
  date: string;
  cost: number;
  calls: number;
}

interface ProjectCost {
  projectId: string;
  projectName: string;
  projectSlug: string;
  totalCost: number;
  apiCalls: number;
}

interface UsageResponse {
  period: { start: string; end: string };
  tokenUsage: TokenUsageData;
  dailyCosts: DailyCost[];
  budget: BudgetData;
  projectCosts: ProjectCost[];
  creditBalance: number;
  monthlyCredits: number;
  tier: string;
}

interface BillingUsageDashboardProps {
  workspaceId: string;
}

const AGENT_LABELS: Record<string, string> = {
  analyst: "Analyst",
  planner: "Planner",
  executor: "Executor",
  reporter: "Reporter",
};

const AGENT_COLORS: Record<string, string> = {
  analyst: "bg-blue-400",
  planner: "bg-violet-400",
  executor: "bg-amber-400",
  reporter: "bg-emerald-400",
};

export function BillingUsageDashboard({ workspaceId }: BillingUsageDashboardProps) {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUsage() {
      try {
        const res = await fetch("/api/billing/usage", {
          headers: { "x-workspace-id": workspaceId },
        });
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
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-white/[0.02] animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Failed to load usage data.</p>;
  }

  const { tokenUsage, budget, dailyCosts, projectCosts } = data;

  return (
    <div className="space-y-6">
      {/* Budget warning */}
      {budget.isNearLimit && (
        <div
          className={cn(
            "flex items-center gap-3 p-3 rounded-xl border",
            budget.isOverLimit
              ? "border-red-400/30 bg-red-400/5"
              : "border-amber-400/30 bg-amber-400/5"
          )}
        >
          <AlertTriangle
            className={cn(
              "h-4 w-4",
              budget.isOverLimit ? "text-red-400" : "text-amber-400"
            )}
          />
          <span className="text-sm">
            {budget.isOverLimit
              ? "You have exceeded your usage limit for this billing period."
              : "You are approaching your usage limit (80%+). Consider upgrading your plan."}
          </span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard
          icon={DollarSign}
          label="Token Cost"
          value={`$${tokenUsage.totalCost.toFixed(4)}`}
          sub={`${budget.budgetLimit ? `of $${budget.budgetLimit} budget` : "no budget set"}`}
        />
        <SummaryCard
          icon={Cpu}
          label="API Calls"
          value={Object.values(tokenUsage.byModel).reduce((s, m) => s + m.calls, 0).toLocaleString()}
          sub={`${Object.keys(tokenUsage.byModel).length} models used`}
        />
        <SummaryCard
          icon={Activity}
          label="Credits"
          value={`${budget.creditsUsed.toLocaleString()} / ${budget.creditsLimit.toLocaleString()}`}
          sub={`${Math.round(budget.creditsPercent)}% used`}
        />
      </div>

      {/* Cost by agent phase */}
      {Object.keys(tokenUsage.byAgent).length > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h4 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Bot className="h-3.5 w-3.5" />
            Cost by Agent Phase
          </h4>
          <div className="space-y-2">
            {Object.entries(tokenUsage.byAgent)
              .sort(([, a], [, b]) => b.cost - a.cost)
              .map(([agent, stats]) => {
                const pct = tokenUsage.totalCost > 0
                  ? (stats.cost / tokenUsage.totalCost) * 100
                  : 0;
                return (
                  <div key={agent} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-16">
                      {AGENT_LABELS[agent] ?? agent}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", AGENT_COLORS[agent] ?? "bg-white/20")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-foreground w-20 text-right">
                      ${stats.cost.toFixed(4)}
                    </span>
                    <span className="text-[10px] text-muted-foreground w-14 text-right">
                      {stats.calls} calls
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Cost by model */}
      {Object.keys(tokenUsage.byModel).length > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h4 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Cpu className="h-3.5 w-3.5" />
            Cost by Model
          </h4>
          <div className="space-y-2">
            {Object.entries(tokenUsage.byModel)
              .sort(([, a], [, b]) => b.cost - a.cost)
              .map(([model, stats]) => (
                <div key={model} className="flex items-center justify-between py-1">
                  <span className="text-xs text-foreground font-mono">{model}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground">{stats.calls} calls</span>
                    <span className="text-xs text-foreground font-medium">${stats.cost.toFixed(4)}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Daily cost trend */}
      {dailyCosts.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h4 className="text-xs font-medium text-muted-foreground mb-3">
            Daily Cost Trend (30 days)
          </h4>
          <div className="flex items-end gap-[2px] h-16">
            {dailyCosts.map((day) => {
              const maxCost = Math.max(...dailyCosts.map((d) => d.cost), 0.001);
              const height = (day.cost / maxCost) * 100;
              return (
                <div
                  key={day.date}
                  className="flex-1 bg-orbit-accent/30 hover:bg-orbit-accent/50 rounded-t transition-colors cursor-default"
                  style={{ height: `${Math.max(height, 2)}%` }}
                  title={`${day.date}: $${day.cost.toFixed(4)} (${day.calls} calls)`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Per-project costs */}
      {projectCosts.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <h4 className="text-xs font-medium text-muted-foreground">
              Cost by Project
            </h4>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {projectCosts.map((project) => (
              <div key={project.projectId} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <span className="text-sm text-foreground">{project.projectName}</span>
                  <span className="text-[11px] text-muted-foreground ml-2">{project.apiCalls} calls</span>
                </div>
                <span className="text-sm font-medium text-foreground">
                  ${project.totalCost.toFixed(4)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="text-lg font-semibold text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}
