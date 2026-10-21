"use client";

import { Pending } from "@/components/telemetry/pending";
import { useState, useEffect, useCallback } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className="border-b border-border px-6 py-4 pr-12">
          <DialogTitle>Buy credits</DialogTitle>
          <DialogDescription className="tm-label text-tm-t3">
            Current balance <span className="tm-num">{balance.toLocaleString("en-US")}</span> credits
          </DialogDescription>
        </DialogHeader>

        {/* Packages */}
        <div className="p-6">
          {loading ? (
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-40 rounded-lg bg-muted"
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
          <p className="text-center text-[12px] text-tm-t3">
            Credits are added to your workspace after payment. One-time purchase, no recurring charge.
          </p>
        </div>
      </DialogContent>
    </Dialog>
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
        "relative rounded-lg border p-4 flex flex-col transition-colors",
        pkg.popular
          ? "border-tm-line-strong bg-foreground/[0.06]"
          : "border-border bg-foreground/[0.02] hover:border-border"
      )}
    >
      {pkg.popular && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
          <span className="tm-label rounded-sm bg-primary px-1.5 py-0.5 text-primary-foreground">Popular</span>
        </div>
      )}

      <div className="mb-3">
        <h3 className="text-sm font-medium text-foreground">{pkg.name}</h3>
        <div className="flex items-baseline gap-1 mt-1">
          <span className="text-xl font-medium text-foreground">
            ${(pkg.price / 100).toFixed(2)}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          ${pricePerCredit}/credit
        </p>
      </div>

      <div className="flex-1 mb-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Check className="h-3 w-3 text-foreground" />
          {pkg.credits.toLocaleString()} credits added instantly
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
          <Check className="h-3 w-3 text-foreground" />
          Credits never expire
        </div>
      </div>

      <button
        onClick={onPurchase}
        disabled={disabled}
        className={cn(
          "flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm font-medium transition-colors",
          pkg.popular
            ? "bg-primary text-primary-foreground hover:bg-primary/85"
            : "bg-foreground/10 text-foreground hover:bg-foreground/15",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        {purchasing ? (
          <Pending />
        ) : (
          "Buy Now"
        )}
      </button>
    </div>
  );
}
