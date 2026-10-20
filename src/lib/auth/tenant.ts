/**
 * Tenant isolation helpers.
 * Ensures all queries are scoped to the correct workspace.
 */

import { isSelfHosted } from "@/lib/self-host";

/** Returns a Prisma `where` clause that filters by workspace_id. */
export function withWorkspace(workspaceId: string) {
  return { workspaceId } as const;
}

/** Combines a workspace filter with additional where conditions. */
export function withWorkspaceAnd<T extends Record<string, unknown>>(
  workspaceId: string,
  conditions: T
) {
  return { workspaceId, ...conditions };
}

/**
 * Tier limits configuration.
 * Maps tier names to their resource limits.
 */
interface TierLimitValues {
  members: number;
  projects: number;
  runsPerMonth: number;
  monthlyCredits: number;
  rateLimit: number;
  allowedModels: readonly string[];
}

const CLOUD_TIER_LIMITS = {
  free: {
    members: 2,
    projects: 1,
    runsPerMonth: 100,
    monthlyCredits: 100,
    rateLimit: 60, // requests per minute
    allowedModels: ["claude-haiku-4-5-20251001"] as readonly string[],
  },
  starter: {
    members: 5,
    projects: 5,
    runsPerMonth: 500,
    monthlyCredits: 1000,
    rateLimit: 120,
    allowedModels: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6"] as readonly string[],
  },
  professional: {
    members: 10,
    projects: Infinity,
    runsPerMonth: 5000,
    monthlyCredits: 2000,
    rateLimit: 300,
    allowedModels: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-6"] as readonly string[],
  },
  enterprise: {
    members: Infinity,
    projects: Infinity,
    runsPerMonth: Infinity,
    monthlyCredits: Infinity,
    rateLimit: Infinity,
    allowedModels: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-6"] as readonly string[],
  },
} satisfies Record<string, TierLimitValues>;

export type WorkspaceTier = keyof typeof CLOUD_TIER_LIMITS;

/** Self-hosted instances have no plans: every tier gets the unlimited enterprise limits. */
export const TIER_LIMITS: Record<WorkspaceTier, TierLimitValues> = isSelfHosted()
  ? {
      free: CLOUD_TIER_LIMITS.enterprise,
      starter: CLOUD_TIER_LIMITS.enterprise,
      professional: CLOUD_TIER_LIMITS.enterprise,
      enterprise: CLOUD_TIER_LIMITS.enterprise,
    }
  : CLOUD_TIER_LIMITS;

/** Check if a workspace tier allows a specific model. */
export function isModelAllowed(tier: WorkspaceTier, model: string): boolean {
  const limits = TIER_LIMITS[tier];
  if (limits.rateLimit === Infinity) return true; // enterprise
  return limits.allowedModels.includes(model);
}

/** Budget warning threshold (80%). */
export const BUDGET_WARNING_THRESHOLD = 0.8;

/** Check if workspace is approaching budget limit. Returns percentage used. */
export function getBudgetPercentage(creditsUsed: number, tier: WorkspaceTier): number {
  const limit = TIER_LIMITS[tier].monthlyCredits;
  if (limit === Infinity) return 0;
  return creditsUsed / limit;
}

/** Check if workspace is at or above budget warning threshold. */
export function isBudgetWarning(creditsUsed: number, tier: WorkspaceTier): boolean {
  return getBudgetPercentage(creditsUsed, tier) >= BUDGET_WARNING_THRESHOLD;
}
