"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { PricingCard } from "./pricing-card";

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

interface PricingContent {
  headline: string;
  subheadline: string;
  tiers: PricingTier[];
}

export function PricingSection({ content }: { content: PricingContent }) {
  const [annual, setAnnual] = useState(false);

  return (
    <section className="py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            {content.headline}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {content.subheadline}
          </p>

          {/* Billing toggle */}
          <div className="mt-8 flex items-center justify-center gap-3">
            <span
              className={`text-sm ${!annual ? "text-foreground" : "text-muted-foreground"}`}
            >
              Monthly
            </span>
            <button
              onClick={() => setAnnual(!annual)}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                annual ? "bg-orbit-accent" : "bg-secondary"
              }`}
              aria-label="Toggle annual billing"
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  annual ? "translate-x-5" : ""
                }`}
              />
            </button>
            <span
              className={`text-sm ${annual ? "text-foreground" : "text-muted-foreground"}`}
            >
              Annual
              <span className="ml-1.5 text-xs text-orbit-accent">Save 15%</span>
            </span>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 lg:gap-8">
          {content.tiers.map((tier, i) => (
            <PricingCard key={tier.name} tier={tier} index={i} annual={annual} />
          ))}
        </div>
      </div>
    </section>
  );
}
