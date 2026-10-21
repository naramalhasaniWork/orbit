"use client";

import { motion } from "framer-motion";
import { PricingSection } from "@/components/marketing/pricing-section";
import { CtaSection } from "@/components/marketing/cta-section";
import pricingContent from "@/app/(marketing)/content/pricing.json";
import { CREDIT_PACKAGES } from "@/lib/stripe/credit-packages";
import { tierLimitFeatures, type WorkspaceTier } from "@/lib/auth/tier-limits";

// Numeric limits come from TIER_LIMITS so the page matches what is enforced
const pricingWithLimits = {
  ...pricingContent,
  tiers: pricingContent.tiers.map((tier) => {
    const limits = tierLimitFeatures(tier.tier as WorkspaceTier);
    const [first, ...rest] = tier.features;
    // Keep "Everything in X" as the lead line when present
    return first?.startsWith("Everything in")
      ? { ...tier, features: [first, ...limits, ...rest] }
      : { ...tier, features: [...limits, ...tier.features] };
  }),
};

export function PricingPageClient() {
  return (
    <div className="pt-24">
      <PricingSection content={pricingWithLimits} />

      {/* FAQ */}
      <section className="py-16 lg:py-24 bg-card/50">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-2xl sm:text-3xl font-bold text-center mb-12"
          >
            Frequently asked questions
          </motion.h2>

          <div className="space-y-6">
            {pricingContent.faq.map((item, i) => (
              <motion.div
                key={item.question}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                className="rounded-xl border border-border bg-card p-6"
              >
                <h3 className="font-semibold mb-2">{item.question}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.answer}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Credit packs */}
      <section className="py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              Need more credits?
            </h2>
            <p className="text-muted-foreground mb-10">
              Purchase top-up packs anytime. Purchased credits never expire.
            </p>
          </motion.div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 max-w-3xl mx-auto">
            {CREDIT_PACKAGES.map((pack, i) => (
              <motion.div
                key={pack.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="rounded-xl border border-border bg-card p-6"
              >
                <div className="text-2xl font-bold">
                  {pack.credits.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground mb-3">
                  credits
                </div>
                <div className="text-lg font-semibold text-orbit-accent">
                  ${(pack.price / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}
                </div>
                <div className="text-xs text-muted-foreground">
                  {(pack.price / pack.credits).toFixed(1)}c per credit
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <CtaSection />
    </div>
  );
}
