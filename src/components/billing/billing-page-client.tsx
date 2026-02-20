"use client";

import { useCallback, useState } from "react";
import { SubscriptionStatus } from "./subscription-status";
import { BillingUsageDashboard } from "./usage-dashboard";
import { InvoiceHistory } from "./invoice-history";
import { PricingSelector } from "./pricing-selector";

interface BillingPageClientProps {
  workspaceId: string;
}

export function BillingPageClient({ workspaceId }: BillingPageClientProps) {
  const [showPricing, setShowPricing] = useState(false);

  const handleSelectTier = useCallback(
    async (tier: string, billing: "monthly" | "annual") => {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({ tier, billing }),
      });

      const json = await res.json();
      if (json.success && json.data.url) {
        window.location.href = json.data.url;
      }
    },
    [workspaceId]
  );

  return (
    <div className="space-y-8">
      {/* Current subscription */}
      <SubscriptionStatus workspaceId={workspaceId} />

      {/* Upgrade section */}
      <div>
        <button
          onClick={() => setShowPricing(!showPricing)}
          className="text-sm font-medium text-orbit-accent hover:text-orbit-accent/80 transition-colors"
        >
          {showPricing ? "Hide plans" : "Compare plans & upgrade"}
        </button>

        {showPricing && (
          <div className="mt-4">
            <PricingSelector
              currentTier="free"
              onSelectTier={handleSelectTier}
            />
          </div>
        )}
      </div>

      {/* Token usage dashboard */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">
          Token Usage & Costs
        </h3>
        <BillingUsageDashboard workspaceId={workspaceId} />
      </div>

      {/* Invoice history */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">
          Invoice History
        </h3>
        <InvoiceHistory workspaceId={workspaceId} />
      </div>
    </div>
  );
}
