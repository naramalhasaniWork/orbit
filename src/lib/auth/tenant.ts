/**
 * Tenant isolation helpers.
 * Ensures all queries are scoped to the correct workspace.
 */

import { prisma } from "@/lib/db";
import { checkBudgetLimit } from "@/lib/billing/usage-aggregator";
import { TIER_LIMITS, type WorkspaceTier } from "./tier-limits";

export { TIER_LIMITS, type WorkspaceTier };

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

/** Check if a workspace tier allows a specific model. */
export function isModelAllowed(tier: WorkspaceTier, model: string): boolean {
  const limits = TIER_LIMITS[tier];
  if (limits.rateLimit === Infinity) return true; // enterprise
  return limits.allowedModels.includes(model);
}

/** Budget warning threshold (80%). */
export const BUDGET_WARNING_THRESHOLD = 0.8;

/**
 * A workspace's monthly credit allowance: the seat-aware grant synced from
 * its Stripe subscription (workspace.monthlyCredits), or Infinity on tiers
 * with unlimited credits.
 */
export function monthlyCreditAllowance(tier: WorkspaceTier, workspaceMonthlyCredits: number): number {
  return TIER_LIMITS[tier].monthlyCredits === Infinity ? Infinity : workspaceMonthlyCredits;
}

/** Fraction of the monthly allowance used (0 for unlimited or zero allowances). */
export function getBudgetPercentage(creditsUsed: number, allowance: number): number {
  if (allowance === Infinity || allowance <= 0) return 0;
  return creditsUsed / allowance;
}

/**
 * What a caller is about to consume:
 *  - run:     start a new test run (monthly run count + credits)
 *  - credits: spend credits on an already-created run (balance + token budget)
 *  - project: create a project
 *  - member:  invite a member (pending invites count)
 */
export type ConsumptionKind = "run" | "credits" | "project" | "member";

export type ConsumeDecision =
  | { allowed: true }
  | { allowed: false; code: "LIMIT_REACHED" | "INSUFFICIENT_CREDITS" | "BUDGET_EXCEEDED" | "NOT_FOUND"; reason: string };

/**
 * The single choke point for every plan limit and credit check.
 * Limits come from TIER_LIMITS keyed by `workspace.tier` only (never the
 * legacy `plan` string or the per-workspace *Limit columns).
 */
export async function canConsume(
  workspaceId: string,
  kind: ConsumptionKind
): Promise<ConsumeDecision> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { tier: true, creditBalance: true },
  });
  if (!workspace) {
    return { allowed: false, code: "NOT_FOUND", reason: "Workspace not found" };
  }

  const limits = TIER_LIMITS[workspace.tier];

  switch (kind) {
    case "project": {
      const count = await prisma.project.count({ where: { workspaceId, deletedAt: null } });
      return count >= limits.projects
        ? limitReached(`Project limit reached (${limits.projects}). Upgrade your plan to create more projects.`)
        : { allowed: true };
    }
    case "member": {
      const [members, pending] = await Promise.all([
        prisma.workspaceMember.count({ where: { workspaceId } }),
        // Expired invites no longer hold a seat
        prisma.workspaceInvitation.count({
          where: { workspaceId, status: "pending", expiresAt: { gt: new Date() } },
        }),
      ]);
      return members + pending >= limits.members
        ? limitReached(`Member limit reached (${limits.members}). Upgrade your plan to add more members.`)
        : { allowed: true };
    }
    case "run": {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthlyRuns = await prisma.testRun.count({
        where: { project: { workspaceId }, createdAt: { gte: monthStart } },
      });
      if (monthlyRuns >= limits.runsPerMonth) {
        return limitReached(
          `Monthly run limit reached (${limits.runsPerMonth}). Upgrade your plan for more runs.`
        );
      }
      return checkCredits(workspaceId, workspace.creditBalance, limits.monthlyCredits);
    }
    case "credits":
      return checkCredits(workspaceId, workspace.creditBalance, limits.monthlyCredits);
  }
}

function limitReached(reason: string): ConsumeDecision {
  return { allowed: false, code: "LIMIT_REACHED", reason };
}

async function checkCredits(
  workspaceId: string,
  creditBalance: number,
  monthlyCredits: number
): Promise<ConsumeDecision> {
  if (monthlyCredits !== Infinity && creditBalance <= 0) {
    return {
      allowed: false,
      code: "INSUFFICIENT_CREDITS",
      reason: "Credit balance is 0. Buy a credit pack or upgrade your plan to run tests.",
    };
  }

  const budget = await checkBudgetLimit(workspaceId);
  if (budget.budgetLimit && budget.usagePercent >= 100) {
    return {
      allowed: false,
      code: "BUDGET_EXCEEDED",
      reason: "Monthly AI token budget exceeded. Raise the budget or wait for the next billing period.",
    };
  }

  return { allowed: true };
}
