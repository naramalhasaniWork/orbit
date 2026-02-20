import { prisma } from "@/lib/db";

type AlertSeverity = "warning" | "critical" | "info";

interface Alert {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  metric?: {
    current: number;
    threshold: number;
    unit: string;
  };
}

/**
 * Check for usage-related alerts for a workspace.
 * Returns a list of alerts sorted by severity (critical first).
 */
export async function checkUsageAlerts(
  workspaceId: string
): Promise<Alert[]> {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: {
      creditBalance: true,
      monthlyCredits: true,
      tokenBudgetMonthly: true,
      billingPeriodStart: true,
      billingPeriodEnd: true,
    },
  });

  const alerts: Alert[] = [];
  const now = new Date();
  const periodStart =
    workspace.billingPeriodStart ?? new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd =
    workspace.billingPeriodEnd ?? new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // 1. Credits below 20% of monthly allocation
  if (workspace.monthlyCredits > 0) {
    const threshold = workspace.monthlyCredits * 0.2;
    if (workspace.creditBalance <= threshold && workspace.creditBalance > 0) {
      alerts.push({
        id: "credits-low",
        severity: "warning",
        title: "Credits running low",
        message: `You have ${workspace.creditBalance} credits remaining (${Math.round((workspace.creditBalance / workspace.monthlyCredits) * 100)}% of monthly allocation).`,
        metric: {
          current: workspace.creditBalance,
          threshold: Math.round(threshold),
          unit: "credits",
        },
      });
    } else if (workspace.creditBalance <= 0) {
      alerts.push({
        id: "credits-exhausted",
        severity: "critical",
        title: "Credits exhausted",
        message: "Your credit balance is zero. Test runs will not execute until credits are replenished.",
      });
    }
  }

  // 2. Spending rate projection
  const burnRate = await calculateBurnRate(workspaceId, periodStart);
  if (burnRate !== null && workspace.creditBalance > 0) {
    const daysRemaining = Math.max(
      1,
      Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    );
    const projectedUsage = burnRate * daysRemaining;

    if (projectedUsage > workspace.creditBalance) {
      const daysUntilExhausted = Math.floor(workspace.creditBalance / burnRate);
      alerts.push({
        id: "burn-rate-high",
        severity: "warning",
        title: "Credits may run out before billing period ends",
        message: `At current usage rate (${Math.round(burnRate)} credits/day), credits will run out in ~${daysUntilExhausted} days.`,
        metric: {
          current: Math.round(burnRate),
          threshold: Math.round(workspace.creditBalance / daysRemaining),
          unit: "credits/day",
        },
      });
    }
  }

  // 3. Single run consumed > 10% of remaining credits
  const recentLargeRuns = await prisma.creditTransaction.findMany({
    where: {
      workspaceId,
      type: "consumption",
      createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { amount: true, testRunId: true, createdAt: true },
  });

  for (const run of recentLargeRuns) {
    const consumed = Math.abs(run.amount);
    const tenPercent = workspace.creditBalance * 0.1;
    if (consumed > tenPercent && tenPercent > 0) {
      alerts.push({
        id: `large-run-${run.testRunId ?? run.createdAt.toISOString()}`,
        severity: "info",
        title: "Large credit consumption detected",
        message: `A recent run consumed ${consumed} credits (>${Math.round((consumed / workspace.creditBalance) * 100)}% of remaining balance).`,
        metric: {
          current: consumed,
          threshold: Math.round(tenPercent),
          unit: "credits",
        },
      });
      break; // Only show the most recent large run
    }
  }

  // 4. Token budget exceeded
  if (workspace.tokenBudgetMonthly) {
    const costResult = await prisma.tokenUsage.aggregate({
      where: {
        workspaceId,
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      _sum: { cost: true },
    });

    const currentCost = Number(costResult._sum.cost ?? 0);
    if (currentCost >= workspace.tokenBudgetMonthly) {
      alerts.push({
        id: "budget-exceeded",
        severity: "critical",
        title: "Monthly token budget exceeded",
        message: `Token spending ($${currentCost.toFixed(2)}) has exceeded your budget ($${workspace.tokenBudgetMonthly}).`,
        metric: {
          current: currentCost,
          threshold: workspace.tokenBudgetMonthly,
          unit: "USD",
        },
      });
    } else if (currentCost >= workspace.tokenBudgetMonthly * 0.8) {
      alerts.push({
        id: "budget-near",
        severity: "warning",
        title: "Approaching token budget limit",
        message: `Token spending ($${currentCost.toFixed(2)}) is at ${Math.round((currentCost / workspace.tokenBudgetMonthly) * 100)}% of your $${workspace.tokenBudgetMonthly} budget.`,
        metric: {
          current: currentCost,
          threshold: workspace.tokenBudgetMonthly,
          unit: "USD",
        },
      });
    }
  }

  // Sort: critical > warning > info
  const severityOrder: Record<AlertSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };

  return alerts.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );
}

async function calculateBurnRate(
  workspaceId: string,
  periodStart: Date
): Promise<number | null> {
  const now = new Date();
  const daysSinceStart = Math.max(
    1,
    Math.ceil((now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24))
  );

  const result = await prisma.creditTransaction.aggregate({
    where: {
      workspaceId,
      type: "consumption",
      createdAt: { gte: periodStart },
    },
    _sum: { amount: true },
  });

  const totalConsumed = Math.abs(Number(result._sum.amount ?? 0));
  if (totalConsumed === 0) return null;

  return totalConsumed / daysSinceStart;
}

export type { Alert, AlertSeverity };
