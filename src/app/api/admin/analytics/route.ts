import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  requireSuperAdmin,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";

const QueryParams = z.object({
  days: z.coerce.number().min(1).max(90).optional().default(30),
});

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();

    const url = new URL(request.url);
    const parsed = QueryParams.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return apiError("Invalid parameters", "VALIDATION_ERROR", 400);
    }

    const { days } = parsed.data;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [
      totalWorkspaces,
      totalUsers,
      totalProjects,
      totalRuns,
      activeRuns,
      recentRuns,
      newUsersThisPeriod,
      newWorkspacesThisPeriod,
    ] = await Promise.all([
      prisma.workspace.count(),
      prisma.user.count(),
      prisma.project.count(),
      prisma.testRun.count(),
      prisma.testRun.count({
        where: { status: { in: ["queued", "indexing", "planning", "executing", "reporting"] } },
      }),
      prisma.testRun.findMany({
        where: { createdAt: { gte: since } },
        select: {
          id: true,
          status: true,
          passed: true,
          failed: true,
          flaky: true,
          totalTests: true,
          creditsConsumed: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.user.count({ where: { createdAt: { gte: since } } }),
      prisma.workspace.count({ where: { createdAt: { gte: since } } }),
    ]);

    // Compute daily aggregates
    const dailyMap = new Map<string, {
      runs: number;
      passed: number;
      failed: number;
      credits: number;
    }>();

    for (const run of recentRuns) {
      const day = run.createdAt.toISOString().slice(0, 10);
      const existing = dailyMap.get(day) ?? { runs: 0, passed: 0, failed: 0, credits: 0 };
      existing.runs += 1;
      existing.passed += run.passed;
      existing.failed += run.failed;
      existing.credits += run.creditsConsumed;
      dailyMap.set(day, existing);
    }

    const dailyStats = Array.from(dailyMap.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Error rate
    const totalTestsRun = recentRuns.reduce((sum, r) => sum + r.totalTests, 0);
    const totalFailed = recentRuns.reduce((sum, r) => sum + r.failed, 0);
    const errorRate = totalTestsRun > 0 ? (totalFailed / totalTestsRun) * 100 : 0;

    // Credits consumed
    const totalCreditsConsumed = recentRuns.reduce((sum, r) => sum + r.creditsConsumed, 0);

    return apiSuccess({
      overview: {
        totalWorkspaces,
        totalUsers,
        totalProjects,
        totalRuns,
        activeRuns,
        errorRate: Math.round(errorRate * 100) / 100,
        totalCreditsConsumed,
      },
      growth: {
        newUsers: newUsersThisPeriod,
        newWorkspaces: newWorkspacesThisPeriod,
        runsInPeriod: recentRuns.length,
      },
      dailyStats,
      period: { days, since: since.toISOString() },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
