import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const searchParams = request.nextUrl.searchParams;
    const days = Math.min(
      parseInt(searchParams.get("days") ?? "30", 10),
      90
    );

    const since = new Date();
    since.setDate(since.getDate() - days);

    const runs = await prisma.testRun.findMany({
      where: {
        projectId,
        status: "completed",
        completedAt: { gte: since },
      },
      orderBy: { completedAt: "asc" },
      select: {
        id: true,
        totalTests: true,
        passed: true,
        failed: true,
        flaky: true,
        skipped: true,
        durationMs: true,
        creditsConsumed: true,
        completedAt: true,
      },
    });

    // Build daily aggregates
    const dailyMap = new Map<
      string,
      {
        runs: number;
        totalTests: number;
        passed: number;
        failed: number;
        flaky: number;
        durationMs: number;
        credits: number;
      }
    >();

    for (const run of runs) {
      const day = run.completedAt
        ? run.completedAt.toISOString().slice(0, 10)
        : "unknown";
      const entry = dailyMap.get(day) ?? {
        runs: 0,
        totalTests: 0,
        passed: 0,
        failed: 0,
        flaky: 0,
        durationMs: 0,
        credits: 0,
      };
      entry.runs++;
      entry.totalTests += run.totalTests;
      entry.passed += run.passed;
      entry.failed += run.failed;
      entry.flaky += run.flaky;
      entry.durationMs += run.durationMs ?? 0;
      entry.credits += run.creditsConsumed;
      dailyMap.set(day, entry);
    }

    const daily = Array.from(dailyMap.entries())
      .filter(([d]) => d !== "unknown")
      .map(([date, stats]) => ({
        date,
        ...stats,
        passRate:
          stats.totalTests > 0
            ? Math.round((stats.passed / stats.totalTests) * 100)
            : 0,
      }));

    // Sparkline data: just pass rates for quick rendering
    const sparkline = daily.map((d) => d.passRate);

    return apiSuccess({
      projectId,
      days,
      totalRuns: runs.length,
      daily,
      sparkline,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
