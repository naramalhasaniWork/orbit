import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/rbac";
import { apiSuccess, handleApiError } from "@/lib/utils/api";
import { getWorkspaceUsage, getDailyUsage, checkBudgetLimit } from "@/lib/billing/usage-aggregator";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePermission(
      request.headers.get("x-workspace-id") ?? "",
      "billing.view"
    );

    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: ctx.workspaceId },
      select: {
        tier: true,
        creditBalance: true,
        monthlyCredits: true,
        billingPeriodStart: true,
        billingPeriodEnd: true,
        tokenBudgetMonthly: true,
      },
    });

    const now = new Date();
    const periodStart = workspace.billingPeriodStart ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = workspace.billingPeriodEnd ?? new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const [tokenUsage, daily, budget, projectUsages] = await Promise.all([
      getWorkspaceUsage(ctx.workspaceId, periodStart, periodEnd),
      getDailyUsage(ctx.workspaceId, 30),
      checkBudgetLimit(ctx.workspaceId),
      getProjectCosts(ctx.workspaceId, periodStart, periodEnd),
    ]);

    return apiSuccess({
      period: {
        start: periodStart.toISOString(),
        end: periodEnd.toISOString(),
      },
      tokenUsage,
      dailyCosts: daily,
      budget,
      projectCosts: projectUsages,
      creditBalance: workspace.creditBalance,
      monthlyCredits: workspace.monthlyCredits,
      tier: workspace.tier,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

async function getProjectCosts(
  workspaceId: string,
  periodStart: Date,
  periodEnd: Date
) {
  const projects = await prisma.project.findMany({
    where: { workspaceId, deletedAt: null },
    select: { id: true, name: true, slug: true },
  });

  const results = await Promise.all(
    projects.map(async (project) => {
      const costResult = await prisma.tokenUsage.aggregate({
        where: {
          projectId: project.id,
          createdAt: { gte: periodStart, lte: periodEnd },
        },
        _sum: { cost: true },
        _count: { id: true },
      });

      return {
        projectId: project.id,
        projectName: project.name,
        projectSlug: project.slug,
        totalCost: Number(costResult._sum.cost ?? 0),
        apiCalls: costResult._count.id,
      };
    })
  );

  return results.sort((a, b) => b.totalCost - a.totalCost);
}
