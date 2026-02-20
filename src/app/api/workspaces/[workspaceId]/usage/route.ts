import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/rbac";
import { TIER_LIMITS, type WorkspaceTier } from "@/lib/auth/tenant";
import { apiSuccess, apiError, handleApiError } from "@/lib/utils/api";

// ============================================================
// GET /api/workspaces/[workspaceId]/usage — Workspace usage stats
// ============================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    await requirePermission(workspaceId, "workspace.view");

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        tier: true,
        creditBalance: true,
        monthlyCredits: true,
        runLimit: true,
        memberLimit: true,
        projectLimit: true,
      },
    });

    if (!workspace) {
      return apiError("Workspace not found", "NOT_FOUND", 404);
    }

    const tier = workspace.tier as WorkspaceTier;
    const limits = TIER_LIMITS[tier];

    // Current counts
    const [memberCount, projectCount] = await Promise.all([
      prisma.workspaceMember.count({ where: { workspaceId } }),
      prisma.project.count({ where: { workspaceId, deletedAt: null } }),
    ]);

    // Monthly run count
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const monthlyRuns = await prisma.testRun.count({
      where: {
        project: { workspaceId },
        createdAt: { gte: monthStart },
      },
    });

    // Monthly credits consumed
    const monthlyCreditsUsed = await prisma.creditTransaction.aggregate({
      where: {
        workspaceId,
        type: "consumption",
        createdAt: { gte: monthStart },
      },
      _sum: { amount: true },
    });

    // Daily run counts for the current month (for the chart)
    const dailyRuns = await prisma.testRun.groupBy({
      by: ["createdAt"],
      where: {
        project: { workspaceId },
        createdAt: { gte: monthStart },
      },
      _count: true,
    });

    // Build daily aggregation
    const dailyMap = new Map<string, number>();
    for (const run of dailyRuns) {
      const day = run.createdAt.toISOString().split("T")[0];
      dailyMap.set(day, (dailyMap.get(day) ?? 0) + run._count);
    }

    const dailyUsage = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, runs: count }));

    // Recent credit transactions
    const recentTransactions = await prisma.creditTransaction.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        type: true,
        amount: true,
        balance: true,
        description: true,
        createdAt: true,
      },
    });

    return apiSuccess({
      tier,
      limits: {
        members: limits?.members ?? workspace.memberLimit,
        projects: limits?.projects ?? workspace.projectLimit,
        runsPerMonth: limits?.runsPerMonth ?? workspace.runLimit,
        monthlyCredits: limits?.monthlyCredits ?? workspace.monthlyCredits,
      },
      current: {
        members: memberCount,
        projects: projectCount,
        runsThisMonth: monthlyRuns,
        creditsUsedThisMonth: Math.abs(monthlyCreditsUsed._sum.amount ?? 0),
        creditBalance: workspace.creditBalance,
      },
      dailyUsage,
      recentTransactions,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
