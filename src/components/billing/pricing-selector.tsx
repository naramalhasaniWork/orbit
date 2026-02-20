"use client";

import { useState } from "react";
import { Check, Zap, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
    credits: "500 credits/month",
    features: [
      "1 project",
      "1 team member",
      "500 credits/month",
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
    credits: "5,000 credits/month per seat",
    features: [
      "Unlimited projects",
      "5,000 credits/month per seat",
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
    credits: "20,000 credits/month per seat",
    features: [
      "Everything in Pro",
      "20,000 credits/month per seat",
      "Role-based permissions",
      "Audit logs",
      "SSO support",
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
          <span className="ml-1.5 text-xs text-green-400">Save 15%</span>
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
                  ? "border-orbit-accent/40 bg-orbit-accent/[0.03]"
                  : "border-border bg-muted/30",
                isCurrent && "ring-1 ring-orbit-accent/30"
              )}
            >
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-foreground">{tier.name}</h3>
                  {isCurrent && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-orbit-accent/15 text-orbit-accent">
                      Current
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1">
                  {price === 0 ? (
                    <span className="text-2xl font-bold text-foreground">Free</span>
                  ) : (
                    <>
                      <span className="text-2xl font-bold text-foreground">${price}</span>
                      <span className="text-xs text-muted-foreground">/{tier.period}</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{tier.credits}</p>
              </div>

              <ul className="space-y-2 mb-5 flex-1">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Check className="h-3.5 w-3.5 mt-0.5 text-orbit-accent shrink-0" />
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
                        ? "bg-orbit-accent text-white hover:bg-orbit-accent/90"
                        : "bg-muted/60 text-foreground hover:bg-muted/70",
                  loading === tier.key && "opacity-70"
                )}
              >
                {loading === tier.key ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
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
