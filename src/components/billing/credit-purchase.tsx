"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Coins, Loader2, Sparkles, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price: number;
  popular?: boolean;
}

interface CreditPurchaseProps {
  workspaceId: string;
  open: boolean;
  onClose: () => void;
  creditBalance?: number;
}

export function CreditPurchaseDialog({
  workspaceId,
  open,
  onClose,
  creditBalance,
}: CreditPurchaseProps) {
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [balance, setBalance] = useState(creditBalance ?? 0);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  const fetchPackages = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/credits", {
        headers: { "x-workspace-id": workspaceId },
      });
      const json = await res.json();
      if (json.success) {
        setPackages(json.data.packages);
        setBalance(json.data.creditBalance);
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (open) fetchPackages();
  }, [open, fetchPackages]);

  async function handlePurchase(packageId: string) {
    setPurchasing(packageId);
    try {
      const res = await fetch("/api/billing/credits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({ packageId }),
      });
      const json = await res.json();
      if (json.success && json.data.url) {
        window.location.href = json.data.url;
      }
    } finally {
      setPurchasing(null);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-2xl mx-4 rounded-2xl border border-border bg-[#0a0a0f] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-orbit-accent/15 flex items-center justify-center">
              <Coins className="h-4 w-4 text-orbit-accent" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Buy Credits
              </h2>
              <p className="text-xs text-muted-foreground">
                Current balance: {balance.toLocaleString()} credits
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-foreground/5 transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Packages */}
        <div className="p-6">
          {loading ? (
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-40 rounded-xl bg-foreground/[0.02] animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {packages.map((pkg) => (
                <PackageCard
                  key={pkg.id}
                  pkg={pkg}
                  purchasing={purchasing === pkg.id}
                  disabled={purchasing !== null}
                  onPurchase={() => handlePurchase(pkg.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border">
          <p className="text-[11px] text-muted-foreground text-center">
            Credits are added to your workspace instantly after payment.
            One-time purchase, no recurring charge.
          </p>
        </div>
      </div>
    </div>
  );
}

function PackageCard({
  pkg,
  purchasing,
  disabled,
  onPurchase,
}: {
  pkg: CreditPackage;
  purchasing: boolean;
  disabled: boolean;
  onPurchase: () => void;
}) {
  const pricePerCredit = (pkg.price / 100 / pkg.credits).toFixed(3);

  return (
    <div
      className={cn(
        "relative rounded-xl border p-4 flex flex-col transition-colors",
        pkg.popular
          ? "border-orbit-accent/40 bg-orbit-accent/[0.03]"
          : "border-border bg-foreground/[0.02] hover:border-border"
      )}
    >
      {pkg.popular && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-orbit-accent text-[10px] font-semibold text-white">
            <Sparkles className="h-3 w-3" />
            Popular
          </span>
        </div>
      )}

      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">{pkg.name}</h3>
        <div className="flex items-baseline gap-1 mt-1">
          <span className="text-xl font-bold text-foreground">
            ${(pkg.price / 100).toFixed(2)}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          ${pricePerCredit}/credit
        </p>
      </div>

      <div className="flex-1 mb-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Check className="h-3 w-3 text-orbit-accent" />
          {pkg.credits.toLocaleString()} credits added instantly
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
          <Check className="h-3 w-3 text-orbit-accent" />
          Credits never expire
        </div>
      </div>

      <button
        onClick={onPurchase}
        disabled={disabled}
        className={cn(
          "flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm font-medium transition-colors",
          pkg.popular
            ? "bg-orbit-accent text-white hover:bg-orbit-accent/90"
            : "bg-foreground/10 text-foreground hover:bg-foreground/15",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        {purchasing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          "Buy Now"
        )}
      </button>
    </div>
  );
}
