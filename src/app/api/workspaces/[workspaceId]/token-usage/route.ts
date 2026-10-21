import {
  TIER_LIMITS,
  BUDGET_WARNING_THRESHOLD,
  getBudgetPercentage,
  monthlyCreditAllowance,
  type WorkspaceTier,
} from "@/lib/auth/tenant";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { route } from "@/server/http/route";

// ============================================================
// GET /api/workspaces/[workspaceId]/token-usage — Token cost breakdown
// ============================================================

export const GET = route(
  { workspace: "param", permission: "billing.view" },
  async ({ req: request, workspaceId, db }) => {
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        tier: true,
        billingPeriodStart: true,
        billingPeriodEnd: true,
        monthlyCredits: true,
      },
    });

    if (!workspace) {
      return apiError("Workspace not found", "NOT_FOUND", 404);
    }

    const tier = workspace.tier as WorkspaceTier;

    // Determine billing period
    const periodStart = workspace.billingPeriodStart ?? getMonthStart();
    const periodEnd = workspace.billingPeriodEnd ?? getMonthEnd();

    // Total cost this billing period
    const totalUsage = await db.tokenUsage.aggregate({
      where: {
        workspaceId,
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      _sum: { cost: true, inputTokens: true, outputTokens: true, cachedTokens: true },
      _count: true,
    });

    // Breakdown by model
    const byModel = await db.tokenUsage.groupBy({
      by: ["model"],
      where: {
        workspaceId,
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      _sum: { cost: true, inputTokens: true, outputTokens: true },
      _count: true,
      orderBy: { _sum: { cost: "desc" } },
    });

    // Breakdown by agent phase
    const byAgent = await db.tokenUsage.groupBy({
      by: ["agentPhase"],
      where: {
        workspaceId,
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      _sum: { cost: true, inputTokens: true, outputTokens: true },
      _count: true,
      orderBy: { _sum: { cost: "desc" } },
    });

    // Breakdown by project
    const byProject = await db.tokenUsage.groupBy({
      by: ["projectId"],
      where: {
        workspaceId,
        createdAt: { gte: periodStart, lte: periodEnd },
        projectId: { not: null },
      },
      _sum: { cost: true, inputTokens: true, outputTokens: true },
      _count: true,
      orderBy: { _sum: { cost: "desc" } },
    });

    // Enrich project names
    const projectIds = byProject
      .map((p) => p.projectId)
      .filter((id): id is string => id !== null);

    const projects = projectIds.length > 0
      ? await db.project.findMany({
          where: { id: { in: projectIds }, workspaceId },
          select: { id: true, name: true, slug: true },
        })
      : [];

    const projectMap = new Map(projects.map((p) => [p.id, p]));

    // Daily cost trend
    const dailyUsage = await db.tokenUsage.groupBy({
      by: ["createdAt"],
      where: {
        workspaceId,
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      _sum: { cost: true },
      _count: true,
    });

    const dailyMap = new Map<string, { cost: number; calls: number }>();
    for (const entry of dailyUsage) {
      const day = entry.createdAt.toISOString().split("T")[0];
      const existing = dailyMap.get(day) ?? { cost: 0, calls: 0 };
      existing.cost += Number(entry._sum.cost ?? 0);
      existing.calls += entry._count;
      dailyMap.set(day, existing);
    }

    const dailyTrend = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    // Credit consumption this period
    const creditsUsed = await db.creditTransaction.aggregate({
      where: {
        workspaceId,
        type: "consumption",
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      _sum: { amount: true },
    });

    const creditsConsumed = Math.abs(creditsUsed._sum.amount ?? 0);
    const monthlyLimit = monthlyCreditAllowance(tier, workspace.monthlyCredits);
    const budgetPercentage = getBudgetPercentage(creditsConsumed, monthlyLimit);

    // Search param for additional filtering
    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const modelLimit = limitParam ? parseInt(limitParam, 10) : undefined;

    return apiSuccess({
      period: {
        start: periodStart,
        end: periodEnd,
      },
      totals: {
        cost: Number(totalUsage._sum.cost ?? 0),
        inputTokens: totalUsage._sum.inputTokens ?? 0,
        outputTokens: totalUsage._sum.outputTokens ?? 0,
        cachedTokens: totalUsage._sum.cachedTokens ?? 0,
        apiCalls: totalUsage._count,
      },
      credits: {
        used: creditsConsumed,
        limit: monthlyLimit === Infinity ? null : monthlyLimit,
        percentage: Math.round(budgetPercentage * 100),
        warning: budgetPercentage >= BUDGET_WARNING_THRESHOLD,
        warningThreshold: BUDGET_WARNING_THRESHOLD * 100,
      },
      breakdown: {
        byModel: (modelLimit ? byModel.slice(0, modelLimit) : byModel).map((m) => ({
          model: m.model,
          cost: Number(m._sum.cost ?? 0),
          inputTokens: m._sum.inputTokens ?? 0,
          outputTokens: m._sum.outputTokens ?? 0,
          calls: m._count,
        })),
        byAgent: byAgent.map((a) => ({
          agent: a.agentPhase,
          cost: Number(a._sum.cost ?? 0),
          inputTokens: a._sum.inputTokens ?? 0,
          outputTokens: a._sum.outputTokens ?? 0,
          calls: a._count,
        })),
        byProject: byProject.map((p) => ({
          projectId: p.projectId,
          projectName: p.projectId ? projectMap.get(p.projectId)?.name ?? "Unknown" : "Unassigned",
          projectSlug: p.projectId ? projectMap.get(p.projectId)?.slug ?? null : null,
          cost: Number(p._sum.cost ?? 0),
          inputTokens: p._sum.inputTokens ?? 0,
          outputTokens: p._sum.outputTokens ?? 0,
          calls: p._count,
        })),
      },
      dailyTrend,
      allowedModels: [...TIER_LIMITS[tier].allowedModels],
    });
  }
);

function getMonthStart(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getMonthEnd(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}
