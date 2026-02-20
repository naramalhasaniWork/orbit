import type { WorkspaceTier } from "@/lib/auth/tenant";

/**
 * Stripe price/product configuration mapped to Orbit tiers.
 * Price IDs should be set in environment variables and correspond
 * to products created in the Stripe dashboard.
 */

interface TierConfig {
  name: string;
  priceMonthly: number;
  priceAnnual: number | null;
  creditsPerSeat: number;
  maxProjects: number;
  maxMembers: number;
  stripePriceIdMonthly: string | null;
  stripePriceIdAnnual: string | null;
  features: string[];
}

const TIER_CONFIG: Record<WorkspaceTier, TierConfig> = {
  free: {
    name: "Free",
    priceMonthly: 0,
    priceAnnual: null,
    creditsPerSeat: 500,
    maxProjects: 1,
    maxMembers: 1,
    stripePriceIdMonthly: null,
    stripePriceIdAnnual: null,
    features: [
      "1 project",
      "1 team member",
      "500 credits/month",
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
    creditsPerSeat: 5000,
    maxProjects: -1, // unlimited
    maxMembers: 10,
    stripePriceIdMonthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID ?? "",
    stripePriceIdAnnual: process.env.STRIPE_PRO_ANNUAL_PRICE_ID ?? "",
    features: [
      "Unlimited projects",
      "5,000 credits/month per seat",
      "All integrations (Linear, Slack, VS Code, CLI)",
      "Custom system prompts",
      "Plugin marketplace access",
      "Self-healing selectors",
      "Email support with SLA",
    ],
  },
  professional: {
    name: "Team",
    priceMonthly: 149,
    priceAnnual: 127,
    creditsPerSeat: 20000,
    maxProjects: -1,
    maxMembers: 50,
    stripePriceIdMonthly: process.env.STRIPE_TEAM_MONTHLY_PRICE_ID ?? "",
    stripePriceIdAnnual: process.env.STRIPE_TEAM_ANNUAL_PRICE_ID ?? "",
    features: [
      "Everything in Pro",
      "20,000 credits/month per seat",
      "Admin settings and role-based permissions",
      "Audit logs and compliance exports",
      "SSO (Google Workspace, Okta)",
      "Plugin authoring (private plugins)",
      "Priority support via Slack Connect",
    ],
  },
  enterprise: {
    name: "Enterprise",
    priceMonthly: 0,
    priceAnnual: null,
    creditsPerSeat: 100000,
    maxProjects: -1,
    maxMembers: -1,
    stripePriceIdMonthly: null,
    stripePriceIdAnnual: null,
    features: [
      "Everything in Team",
      "Self-hosted deployment option",
      "Bring your own AI API keys",
      "Custom data retention and residency",
      "SOC 2 Type II report access",
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

export function getTierLimits(tier: WorkspaceTier, seatCount: number = 1) {
  const config = TIER_CONFIG[tier];
  return {
    monthlyCredits: config.creditsPerSeat * seatCount,
    maxProjects: config.maxProjects,
    maxMembers: config.maxMembers,
  };
}

export type { TierConfig };
