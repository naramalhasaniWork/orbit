"use client";

import { useEffect, useState, useCallback } from "react";
import {
  DollarSign,
  Coins,
  TrendingUp,
  Bot,
  AlertTriangle,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CreditPurchaseDialog } from "./credit-purchase";
import {
  AgentTable,
  ModelChart,
  ProjectList,
  DailySparkline,
} from "./cost-breakdown";
import type {
  AgentBreakdown,
  ModelBreakdown,
  ProjectBreakdown,
  DailySpend,
} from "./cost-breakdown";

interface UsageAlert {
  id: string;
  severity: "warning" | "critical" | "info";
  title: string;
  message: string;
}

interface AnalyticsData {
  totalSpend: number;
  totalCalls: number;
  creditBalance: number;
  monthlyCredits: number;
  agents: AgentBreakdown[];
  models: ModelBreakdown[];
  projects: ProjectBreakdown[];
  daily: DailySpend[];
  alerts: UsageAlert[];
}

interface CostDashboardProps {
  workspaceId: string;
}

export function CostDashboard({ workspaceId }: CostDashboardProps) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPurchase, setShowPurchase] = useState(false);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/billing/analytics?period=${period}`, {
        headers: { "x-workspace-id": workspaceId },
      });
      const json = await res.json();
      if (json.success) setData(json.data);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-xl bg-foreground/[0.02]" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">Failed to load cost analytics.</p>
    );
  }

  const creditsUsed = data.monthlyCredits - data.creditBalance;
  const creditsPercent =
    data.monthlyCredits > 0
      ? Math.min(100, (creditsUsed / data.monthlyCredits) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Alerts */}
      {data.alerts.map((alert) => (
        <AlertBanner key={alert.id} alert={alert} />
      ))}

      {/* Period selector + Buy credits */}
      <div className="flex items-center justify-between">
        <PeriodSelector period={period} onChange={setPeriod} />
        <button
          onClick={() => setShowPurchase(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/85 transition-colors"
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          Buy Credits
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <SummaryCard
          icon={DollarSign}
          label="Total Spend"
          value={`$${data.totalSpend.toFixed(2)}`}
          sub={`${data.totalCalls.toLocaleString()} API calls`}
        />
        <SummaryCard
          icon={Coins}
          label="Credits Remaining"
          value={data.creditBalance.toLocaleString()}
          sub={`of ${data.monthlyCredits.toLocaleString()} monthly`}
        />
        <SummaryCard
          icon={TrendingUp}
          label="Credits Used"
          value={creditsUsed.toLocaleString()}
          sub={`${Math.round(creditsPercent)}% of allocation`}
        />
        <SummaryCard
          icon={Bot}
          label="Active Agents"
          value={String(data.agents.length)}
          sub={`${data.models.length} models used`}
        />
      </div>

      {/* Credits usage bar */}
      <CreditBar used={creditsUsed} total={data.monthlyCredits} percent={creditsPercent} />

      {/* Agent breakdown table */}
      {data.agents.length > 0 && <AgentTable agents={data.agents} />}

      {/* Model + Project side by side */}
      <div className="grid grid-cols-2 gap-4">
        {data.models.length > 0 && <ModelChart models={data.models} />}
        {data.projects.length > 0 && <ProjectList projects={data.projects} />}
      </div>

      {/* Daily sparkline */}
      {data.daily.length > 0 && <DailySparkline daily={data.daily} />}

      {/* Credit purchase dialog */}
      <CreditPurchaseDialog
        workspaceId={workspaceId}
        open={showPurchase}
        onClose={() => setShowPurchase(false)}
        creditBalance={data.creditBalance}
      />
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
    <div className="p-4 rounded-xl border border-border bg-foreground/[0.02]">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="text-lg font-medium text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}

function CreditBar({
  used,
  total,
  percent,
}: {
  used: number;
  total: number;
  percent: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-foreground/[0.02] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">Credit Usage</span>
        <span className="text-xs text-foreground">
          {used.toLocaleString()} / {total.toLocaleString()}
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-foreground/[0.06] overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            percent >= 90
              ? "bg-tm-fail"
              : percent >= 70
                ? "bg-tm-warn"
                : "bg-foreground"
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function PeriodSelector({
  period,
  onChange,
}: {
  period: "7d" | "30d" | "90d";
  onChange: (p: "7d" | "30d" | "90d") => void;
}) {
  return (
    <div className="flex items-center gap-1 p-0.5 rounded-lg bg-foreground/[0.04]">
      {(["7d", "30d", "90d"] as const).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={cn(
            "px-3 py-1 rounded-md text-xs font-medium transition-colors",
            period === p
              ? "bg-foreground/10 text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {p === "7d" ? "7 days" : p === "30d" ? "30 days" : "90 days"}
        </button>
      ))}
    </div>
  );
}

function AlertBanner({ alert }: { alert: UsageAlert }) {
  const config = {
    critical: { border: "border-tm-fail/30", bg: "bg-tm-fail/5", icon: "text-tm-fail" },
    warning: { border: "border-tm-warn/30", bg: "bg-tm-warn/5", icon: "text-tm-warn" },
    info: { border: "border-tm-info/30", bg: "bg-tm-info/5", icon: "text-tm-info" },
  }[alert.severity];

  return (
    <div className={cn("flex items-start gap-3 p-3 rounded-xl border", config.border, config.bg)}>
      <AlertTriangle className={cn("h-4 w-4 mt-0.5 shrink-0", config.icon)} />
      <div>
        <p className="text-sm font-medium text-foreground">{alert.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{alert.message}</p>
      </div>
    </div>
  );
}
