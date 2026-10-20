import {
  TIER_LIMITS,
  TIER_DISPLAY_NAMES,
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
    name: TIER_DISPLAY_NAMES.free,
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
    name: TIER_DISPLAY_NAMES.starter,
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
    name: TIER_DISPLAY_NAMES.professional,
    priceMonthly: 149,
    priceAnnual: 127,
    stripePriceIdMonthly: process.env.STRIPE_TEAM_MONTHLY_PRICE_ID ?? "",
    stripePriceIdAnnual: process.env.STRIPE_TEAM_ANNUAL_PRICE_ID ?? "",
    features: [
      "Everything in Pro",
      ...tierLimitFeatures("professional"),
      "Admin settings and role-based permissions",
      "Audit logs and compliance exports",
      "SSO (Google Workspace, Okta)",
      "Plugin authoring (private plugins)",
      "Priority support via Slack Connect",
    ],
  },
  enterprise: {
    name: TIER_DISPLAY_NAMES.enterprise,
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

/**
 * Monthly credit grant for a subscription, from TIER_LIMITS: per seat on
 * seat-based tiers (seats = Stripe subscription quantity). null = unlimited.
 */
export function getMonthlyCreditGrant(tier: WorkspaceTier, seats: number = 1): number | null {
  const { monthlyCredits, seatBased } = TIER_LIMITS[tier];
  if (monthlyCredits === Infinity) return null;
  return seatBased ? monthlyCredits * Math.max(1, seats) : monthlyCredits;
}

export type { TierConfig };
