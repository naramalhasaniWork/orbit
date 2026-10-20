import {
  TIER_LIMITS,
  tierLimitFeatures,
  type WorkspaceTier,
} from "@/lib/auth/tier-limits";

/**
 * Stripe price/product configuration mapped to Orbit tiers.
 * Price IDs should be set in environment variables and correspond
 * to products created in the Stripe dashboard.
 *
 * Numeric limits (projects, members, credits) are NOT defined here: they come
 * from TIER_LIMITS so the price page never advertises something we don't enforce.
 */

interface TierConfig {
  name: string;
  priceMonthly: number;
  priceAnnual: number | null;
  stripePriceIdMonthly: string | null;
  stripePriceIdAnnual: string | null;
  features: string[];
}

const TIER_CONFIG: Record<WorkspaceTier, TierConfig> = {
  free: {
    name: "Free",
    priceMonthly: 0,
    priceAnnual: null,
    stripePriceIdMonthly: null,
    stripePriceIdAnnual: null,
    features: [
      ...tierLimitFeatures("free"),
      "Core indexing, planning, and execution",
      "GitHub integration",
      "Basic dashboard and System Map",
      "Community support",
    ],
  },
  starter: {
    name: "Pro",
    priceMonthly: 79,
    priceAnnual: 67,
    stripePriceIdMonthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID ?? "",
    stripePriceIdAnnual: process.env.STRIPE_PRO_ANNUAL_PRICE_ID ?? "",
    features: [
      ...tierLimitFeatures("starter"),
      "GitHub, Linear, Slack, and webhook integrations",
      "Custom system prompts",
      "Self-healing selectors",
      "Email support with SLA",
    ],
  },
  professional: {
    name: "Team",
    priceMonthly: 149,
    priceAnnual: 127,
    stripePriceIdMonthly: process.env.STRIPE_TEAM_MONTHLY_PRICE_ID ?? "",
    stripePriceIdAnnual: process.env.STRIPE_TEAM_ANNUAL_PRICE_ID ?? "",
    features: [
      "Everything in Pro",
      ...tierLimitFeatures("professional"),
      "Admin settings and role-based permissions",
      "Audit logs and compliance exports",
      "Priority support via Slack Connect",
    ],
  },
  enterprise: {
    name: "Enterprise",
    priceMonthly: 0,
    priceAnnual: null,
    stripePriceIdMonthly: null,
    stripePriceIdAnnual: null,
    features: [
      "Everything in Team",
      ...tierLimitFeatures("enterprise"),
      "Self-hosted deployment option",
      "Bring your own AI API keys",
      "Custom data retention and residency",
      "Dedicated support and onboarding",
      "SLA with uptime guarantees",
    ],
  },
};

export function getTierConfig(tier: WorkspaceTier): TierConfig {
  return TIER_CONFIG[tier];
}

export function getAllTierConfigs(): Record<WorkspaceTier, TierConfig> {
  return TIER_CONFIG;
}

export function getTierFromPriceId(priceId: string): WorkspaceTier | null {
  for (const [tier, config] of Object.entries(TIER_CONFIG)) {
    if (
      config.stripePriceIdMonthly === priceId ||
      config.stripePriceIdAnnual === priceId
    ) {
      return tier as WorkspaceTier;
    }
  }
  return null;
}

/** Stripe-side limits for a tier, from TIER_LIMITS. -1 means unlimited. */
export function getTierLimits(tier: WorkspaceTier) {
  const limits = TIER_LIMITS[tier];
  const finite = (n: number) => (n === Infinity ? -1 : n);
  return {
    monthlyCredits: finite(limits.monthlyCredits),
    maxProjects: finite(limits.projects),
    maxMembers: finite(limits.members),
  };
}

export type { TierConfig };
