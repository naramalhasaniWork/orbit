import { prisma } from "@/lib/db";

interface UsageSummary {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  byModel: Record<string, { cost: number; calls: number }>;
  byAgent: Record<string, { cost: number; calls: number }>;
}

interface DailyUsage {
  date: string;
  cost: number;
  calls: number;
}

interface BudgetCheck {
  currentCost: number;
  budgetLimit: number | null;
  usagePercent: number;
  isNearLimit: boolean;
  isOverLimit: boolean;
  creditsUsed: number;
  creditsLimit: number;
  creditsPercent: number;
}

/**
 * Get total token usage for a workspace within a billing period.
 */
export async function getWorkspaceUsage(
  workspaceId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<UsageSummary> {
  const records = await prisma.tokenUsage.findMany({
    where: {
      workspaceId,
      createdAt: { gte: periodStart, lte: periodEnd },
    },
    select: {
      model: true,
      inputTokens: true,
      outputTokens: true,
      cachedTokens: true,
      cost: true,
      agentPhase: true,
    },
  });

  const summary: UsageSummary = {
    totalCost: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCachedTokens: 0,
    byModel: {},
    byAgent: {},
  };

  for (const record of records) {
    const cost = Number(record.cost);
    summary.totalCost += cost;
    summary.totalInputTokens += record.inputTokens;
    summary.totalOutputTokens += record.outputTokens;
    summary.totalCachedTokens += record.cachedTokens;

    // By model
    if (!summary.byModel[record.model]) {
      summary.byModel[record.model] = { cost: 0, calls: 0 };
    }
    summary.byModel[record.model].cost += cost;
    summary.byModel[record.model].calls += 1;

    // By agent
    if (!summary.byAgent[record.agentPhase]) {
      summary.byAgent[record.agentPhase] = { cost: 0, calls: 0 };
    }
    summary.byAgent[record.agentPhase].cost += cost;
    summary.byAgent[record.agentPhase].calls += 1;
  }

  return summary;
}

/**
 * Get token usage for a specific project.
 */
export async function getProjectUsage(
  projectId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<UsageSummary> {
  const records = await prisma.tokenUsage.findMany({
    where: {
      projectId,
      createdAt: { gte: periodStart, lte: periodEnd },
    },
    select: {
      model: true,
      inputTokens: true,
      outputTokens: true,
      cachedTokens: true,
      cost: true,
      agentPhase: true,
    },
  });

  const summary: UsageSummary = {
    totalCost: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCachedTokens: 0,
    byModel: {},
    byAgent: {},
  };

  for (const record of records) {
    const cost = Number(record.cost);
    summary.totalCost += cost;
    summary.totalInputTokens += record.inputTokens;
    summary.totalOutputTokens += record.outputTokens;
    summary.totalCachedTokens += record.cachedTokens;

    if (!summary.byModel[record.model]) {
      summary.byModel[record.model] = { cost: 0, calls: 0 };
    }
    summary.byModel[record.model].cost += cost;
    summary.byModel[record.model].calls += 1;

    if (!summary.byAgent[record.agentPhase]) {
      summary.byAgent[record.agentPhase] = { cost: 0, calls: 0 };
    }
    summary.byAgent[record.agentPhase].cost += cost;
    summary.byAgent[record.agentPhase].calls += 1;
  }

  return summary;
}

/**
 * Get daily cost trend for a workspace.
 */
export async function getDailyUsage(
  workspaceId: string,
  days: number
): Promise<DailyUsage[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const records = await prisma.tokenUsage.findMany({
    where: {
      workspaceId,
      createdAt: { gte: startDate },
    },
    select: { cost: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const dailyMap = new Map<string, { cost: number; calls: number }>();

  // Initialize all days
  for (let i = 0; i <= days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().split("T")[0];
    dailyMap.set(key, { cost: 0, calls: 0 });
  }

  for (const record of records) {
    const key = record.createdAt.toISOString().split("T")[0];
    const existing = dailyMap.get(key) ?? { cost: 0, calls: 0 };
    existing.cost += Number(record.cost);
    existing.calls += 1;
    dailyMap.set(key, existing);
  }

  return Array.from(dailyMap.entries()).map(([date, data]) => ({
    date,
    cost: Math.round(data.cost * 1000000) / 1000000,
    calls: data.calls,
  }));
}

/**
 * Check if workspace is within budget limits.
 * Returns usage percentages and warnings.
 */
export async function checkBudgetLimit(
  workspaceId: string
): Promise<BudgetCheck> {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: {
      tokenBudgetMonthly: true,
      creditBalance: true,
      monthlyCredits: true,
      billingPeriodStart: true,
      billingPeriodEnd: true,
    },
  });

  const now = new Date();
  const periodStart = workspace.billingPeriodStart ?? new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = workspace.billingPeriodEnd ?? new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Aggregate token costs for this period
  const costResult = await prisma.tokenUsage.aggregate({
    where: {
      workspaceId,
      createdAt: { gte: periodStart, lte: periodEnd },
    },
    _sum: { cost: true },
  });

  const currentCost = Number(costResult._sum.cost ?? 0);
  const budgetLimit = workspace.tokenBudgetMonthly;

  // Credits usage from credit transactions
  const creditResult = await prisma.creditTransaction.aggregate({
    where: {
      workspaceId,
      type: "consumption",
      createdAt: { gte: periodStart, lte: periodEnd },
    },
    _sum: { amount: true },
  });

  const creditsUsed = Math.abs(Number(creditResult._sum.amount ?? 0));
  const creditsLimit = workspace.monthlyCredits;
  const creditsPercent = creditsLimit > 0 ? (creditsUsed / creditsLimit) * 100 : 0;

  const usagePercent = budgetLimit ? (currentCost / budgetLimit) * 100 : 0;

  return {
    currentCost,
    budgetLimit,
    usagePercent,
    isNearLimit: usagePercent >= 80 || creditsPercent >= 80,
    isOverLimit: usagePercent >= 100 || creditsPercent >= 100,
    creditsUsed,
    creditsLimit,
    creditsPercent,
  };
}

export type { UsageSummary, DailyUsage, BudgetCheck };
