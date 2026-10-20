"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface PricingTier {
  name: string;
  price: number | null;
  annualPrice?: number;
  period: string;
  description: string;
  highlight: boolean;
  badge?: string;
  cta: string;
  features: string[];
}

export function PricingCard({
  tier,
  index,
  annual,
}: {
  tier: PricingTier;
  index: number;
  annual: boolean;
}) {
  const displayPrice = annual && tier.annualPrice ? tier.annualPrice : tier.price;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className={`relative rounded-xl border p-6 lg:p-8 flex flex-col ${
        tier.highlight
          ? "border-orbit-accent/40 bg-orbit-accent/[0.04] glow-accent"
          : "border-border bg-card"
      }`}
    >
      {tier.badge && (
        <span className="absolute -top-3 left-6 inline-flex rounded-full bg-orbit-accent px-3 py-0.5 text-xs font-medium text-white">
          {tier.badge}
        </span>
      )}

      <div className="mb-6">
        <h3 className="text-lg font-semibold">{tier.name}</h3>
        <p className="text-sm text-muted-foreground mt-1">{tier.description}</p>
      </div>

      <div className="mb-6">
        {displayPrice !== null ? (
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold">${displayPrice}</span>
            {tier.price !== 0 && (
              <span className="text-sm text-muted-foreground">
                /{tier.period}
              </span>
            )}
          </div>
        ) : (
          <span className="text-4xl font-bold">Custom</span>
        )}
        {annual && tier.annualPrice && tier.price !== 0 && (
          <p className="text-xs text-orbit-accent mt-1">
            Save ${((tier.price ?? 0) - tier.annualPrice) * 12}/year
          </p>
        )}
      </div>

      <Link href={tier.name === "Enterprise" ? "#" : "/login"} className="mb-6">
        <Button
          className={`w-full ${
            tier.highlight
              ? "bg-orbit-accent hover:bg-orbit-accent/90 text-white"
              : ""
          }`}
          variant={tier.highlight ? "default" : "outline"}
        >
          {tier.cta}
        </Button>
      </Link>

      <ul className="space-y-3 flex-1">
        {tier.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm">
            <Check className="h-4 w-4 text-orbit-pass shrink-0 mt-0.5" />
            <span className="text-muted-foreground">{feature}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}
