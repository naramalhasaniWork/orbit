/**
 * Tier limits — the single source of truth for what each plan allows.
 * Enforcement (canConsume in tenant.ts), Stripe grants (lib/stripe/prices.ts)
 * and every price page derive their numbers from this table.
 *
 * concurrentRuns caps simultaneously executing runs per workspace (queued
 * runs wait; see lib/queue/run-slots.ts). Self-hosted is unlimited.
 *
 * monthlyCredits is per seat on seat-based tiers (the Stripe subscription
 * quantity multiplies it) and per workspace otherwise.
 *
 * Kept free of server imports so client components can read it.
 */
export const TIER_LIMITS = {
  free: {
    members: 2,
    projects: 1,
    seatBased: false,
    runsPerMonth: 100,
    concurrentRuns: 1,
    monthlyCredits: 100,
    rateLimit: 60, // requests per minute
    allowedModels: ["claude-haiku-4-5-20251001"] as readonly string[],
  },
  starter: {
    members: 5,
    projects: 5,
    seatBased: true,
    runsPerMonth: 500,
    concurrentRuns: 2,
    monthlyCredits: 1000,
    rateLimit: 120,
    allowedModels: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6"] as readonly string[],
  },
  professional: {
    members: 10,
    projects: Infinity,
    seatBased: true,
    runsPerMonth: 5000,
    concurrentRuns: 5,
    monthlyCredits: 2000,
    rateLimit: 300,
    allowedModels: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-6"] as readonly string[],
  },
  enterprise: {
    members: Infinity,
    projects: Infinity,
    seatBased: false,
    runsPerMonth: Infinity,
    concurrentRuns: Infinity,
    monthlyCredits: Infinity,
    rateLimit: Infinity,
    allowedModels: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-6"] as readonly string[],
  },
} as const;

export type WorkspaceTier = keyof typeof TIER_LIMITS;

/** Customer-facing plan names (the enum keys predate the rebrand). */
export const TIER_DISPLAY_NAMES: Record<WorkspaceTier, string> = {
  free: "Free",
  starter: "Pro",
  professional: "Team",
  enterprise: "Enterprise",
};

/** Display name for a tier value that may come from an untyped API payload. */
export function tierDisplayName(tier: string): string {
  return tier in TIER_DISPLAY_NAMES ? TIER_DISPLAY_NAMES[tier as WorkspaceTier] : tier;
}

function countLabel(n: number, singular: string, plural: string): string {
  if (n === Infinity) return `Unlimited ${plural}`;
  return `${n.toLocaleString("en-US")} ${n === 1 ? singular : plural}`;
}

/** Monthly credit allowance as shown on price pages. */
export function tierCreditsLabel(tier: WorkspaceTier): string {
  const { monthlyCredits, seatBased } = TIER_LIMITS[tier];
  if (monthlyCredits === Infinity) return "Custom credit volume";
  return `${monthlyCredits.toLocaleString("en-US")} credits/month${seatBased ? " per seat" : ""}`;
}

/** The numeric plan features (projects, members, credits), derived from TIER_LIMITS. */
export function tierLimitFeatures(tier: WorkspaceTier): string[] {
  const limits = TIER_LIMITS[tier];
  return [
    countLabel(limits.projects, "project", "projects"),
    countLabel(limits.members, "team member", "team members"),
    tierCreditsLabel(tier),
  ];
}
