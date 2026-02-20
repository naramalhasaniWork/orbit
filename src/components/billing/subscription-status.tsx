"use client";

import { useEffect, useState, useCallback } from "react";
import { Zap, Calendar, Loader2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface SubscriptionData {
  tier: string;
  subscription: {
    id: string;
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    priceId: string;
  } | null;
  hasStripeCustomer: boolean;
  creditBalance: number;
  monthlyCredits: number;
}

interface SubscriptionStatusProps {
  workspaceId: string;
}

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Pro",
  professional: "Team",
  enterprise: "Enterprise",
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "text-green-400 bg-green-400/10" },
  trialing: { label: "Trial", className: "text-blue-400 bg-blue-400/10" },
  past_due: { label: "Past Due", className: "text-red-400 bg-red-400/10" },
  canceled: { label: "Canceled", className: "text-muted-foreground bg-white/5" },
  incomplete: { label: "Incomplete", className: "text-amber-400 bg-amber-400/10" },
  unpaid: { label: "Unpaid", className: "text-red-400 bg-red-400/10" },
};

export function SubscriptionStatus({ workspaceId }: SubscriptionStatusProps) {
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchSubscription = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/subscription", {
        headers: { "x-workspace-id": workspaceId },
      });
      const json = await res.json();
      if (json.success) setData(json.data);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  async function handleAction(action: "cancel" | "reactivate") {
    setActionLoading(true);
    try {
      await fetch("/api/billing/subscription", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({ action }),
      });
      await fetchSubscription();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleManageBilling() {
    setActionLoading(true);
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "x-workspace-id": workspaceId },
      });
      const json = await res.json();
      if (json.success && json.data.url) {
        window.location.href = json.data.url;
      }
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return <div className="h-20 rounded-xl bg-white/[0.02] animate-pulse" />;
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Failed to load subscription.</p>;
  }

  const sub = data.subscription;
  const statusConfig = sub ? (STATUS_CONFIG[sub.status] ?? STATUS_CONFIG.active) : null;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-orbit-accent/15 flex items-center justify-center">
            <Zap className="h-5 w-5 text-orbit-accent" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">
                {TIER_LABELS[data.tier] ?? data.tier} Plan
              </p>
              {sub && statusConfig && (
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusConfig.className}`}>
                  {statusConfig.label}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data.creditBalance.toLocaleString()} credits remaining
              {data.monthlyCredits > 0 && ` of ${data.monthlyCredits.toLocaleString()}/month`}
            </p>
          </div>
        </div>

        {data.hasStripeCustomer && (
          <button
            onClick={handleManageBilling}
            disabled={actionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground bg-white/5 hover:bg-white/10 transition-colors"
          >
            {actionLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <ExternalLink className="h-3 w-3" />
                Manage Billing
              </>
            )}
          </button>
        )}
      </div>

      {sub && (
        <div className="mt-4 pt-4 border-t border-white/[0.06]">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              <span>
                Next billing: {new Date(sub.currentPeriodEnd).toLocaleDateString()}
              </span>
            </div>

            {sub.cancelAtPeriodEnd && (
              <span className="text-amber-400">Cancels at period end</span>
            )}
          </div>

          <div className="flex gap-2 mt-3">
            {sub.cancelAtPeriodEnd ? (
              <button
                onClick={() => handleAction("reactivate")}
                disabled={actionLoading}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-orbit-accent text-white hover:bg-orbit-accent/90 transition-colors"
              >
                Reactivate Subscription
              </button>
            ) : (
              sub.status === "active" && (
                <button
                  onClick={() => handleAction("cancel")}
                  disabled={actionLoading}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 bg-red-400/10 hover:bg-red-400/15 transition-colors"
                >
                  Cancel Subscription
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
