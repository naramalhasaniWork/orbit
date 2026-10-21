"use client";

import { Pending } from "@/components/telemetry/pending";
import { useState } from "react";
import { Check, Zap, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { tierCreditsLabel, tierLimitFeatures } from "@/lib/auth/tier-limits";

interface PricingTier {
  key: string;
  name: string;
  price: number;
  annualPrice: number | null;
  period: string;
  credits: string;
  features: string[];
  highlight: boolean;
  current: boolean;
}

interface PricingSelectorProps {
  currentTier: string;
  onSelectTier: (tier: string, billing: "monthly" | "annual") => Promise<void>;
}

const TIERS: PricingTier[] = [
  {
    key: "free",
    name: "Free",
    price: 0,
    annualPrice: null,
    period: "forever",
    credits: tierCreditsLabel("free"),
    features: [
      ...tierLimitFeatures("free"),
      "Core indexing & execution",
      "GitHub integration",
    ],
    highlight: false,
    current: false,
  },
  {
    key: "starter",
    name: "Pro",
    price: 79,
    annualPrice: 67,
    period: "per seat/month",
    credits: tierCreditsLabel("starter"),
    features: [
      ...tierLimitFeatures("starter"),
      "All integrations",
      "Custom system prompts",
      "Self-healing selectors",
      "Email support with SLA",
    ],
    highlight: true,
    current: false,
  },
  {
    key: "professional",
    name: "Team",
    price: 149,
    annualPrice: 127,
    period: "per seat/month",
    credits: tierCreditsLabel("professional"),
    features: [
      "Everything in Pro",
      ...tierLimitFeatures("professional"),
      "Role-based permissions",
      "Audit logs",
      "Priority support",
    ],
    highlight: false,
    current: false,
  },
];

export function PricingSelector({ currentTier, onSelectTier }: PricingSelectorProps) {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [loading, setLoading] = useState<string | null>(null);

  async function handleSelect(tierKey: string) {
    if (tierKey === currentTier || tierKey === "free") return;
    setLoading(tierKey);
    try {
      await onSelectTier(tierKey, billing);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => setBilling("monthly")}
          className={cn(
            "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
            billing === "monthly"
              ? "bg-muted/60 text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Monthly
        </button>
        <button
          onClick={() => setBilling("annual")}
          className={cn(
            "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
            billing === "annual"
              ? "bg-muted/60 text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Annual
          <span className="ml-1.5 text-xs text-tm-pass">Save 15%</span>
        </button>
      </div>

      {/* Tier cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TIERS.map((tier) => {
          const isCurrent = tier.key === currentTier;
          const price = billing === "annual" && tier.annualPrice ? tier.annualPrice : tier.price;

          return (
            <div
              key={tier.key}
              className={cn(
                "rounded-xl border p-5 flex flex-col",
                tier.highlight
                  ? "border-tm-line-strong bg-foreground/[0.06]"
                  : "border-border bg-muted/30",
                isCurrent && "ring-1 ring-tm-line-strong"
              )}
            >
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-medium text-foreground">{tier.name}</h3>
                  {isCurrent && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-foreground/[0.06] text-foreground">
                      Current
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1">
                  {price === 0 ? (
                    <span className="text-2xl font-medium text-foreground">Free</span>
                  ) : (
                    <>
                      <span className="text-2xl font-medium text-foreground">${price}</span>
                      <span className="text-xs text-muted-foreground">/{tier.period}</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{tier.credits}</p>
              </div>

              <ul className="space-y-2 mb-5 flex-1">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Check className="h-3.5 w-3.5 mt-0.5 text-foreground shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSelect(tier.key)}
                disabled={isCurrent || tier.key === "free" || loading === tier.key}
                className={cn(
                  "flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm font-medium transition-colors",
                  isCurrent
                    ? "bg-muted/40 text-muted-foreground cursor-default"
                    : tier.key === "free"
                      ? "bg-muted/40 text-muted-foreground cursor-default"
                      : tier.highlight
                        ? "bg-primary text-primary-foreground hover:bg-primary/85"
                        : "bg-muted/60 text-foreground hover:bg-muted/70",
                  loading === tier.key && "opacity-70"
                )}
              >
                {loading === tier.key ? (
                  <Pending />
                ) : isCurrent ? (
                  "Current Plan"
                ) : tier.key === "free" ? (
                  "Free Tier"
                ) : (
                  <>
                    Upgrade <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
