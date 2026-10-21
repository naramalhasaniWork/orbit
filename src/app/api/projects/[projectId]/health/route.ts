import { apiSuccess, apiError } from "@/lib/utils/api";
import { route } from "@/server/http/route";

export const GET = route({}, async ({ params: { projectId }, workspaceId, db }) => {
  const project = await db.project.findFirst({
    where: { id: projectId, workspaceId },
    select: {
      id: true,
      healthStatus: true,
      lastRunAt: true,
      lastIndexedAt: true,
    },
  });

  if (!project) {
    return apiError("Project not found", "NOT_FOUND", 404);
  }

  // Get the last 10 runs to compute health score
  const recentRuns = await db.testRun.findMany({
    where: { projectId, status: "completed" },
    orderBy: { completedAt: "desc" },
    take: 10,
    select: {
      id: true,
      status: true,
      passed: true,
      failed: true,
      flaky: true,
      totalTests: true,
      completedAt: true,
      durationMs: true,
    },
  });

  if (recentRuns.length === 0) {
    return apiSuccess({
      projectId,
      healthStatus: project.healthStatus,
      score: null,
      recentRuns: 0,
      passRate: null,
      avgDurationMs: null,
      trend: "neutral" as const,
      lastRunAt: project.lastRunAt,
      lastIndexedAt: project.lastIndexedAt,
    });
  }

  const totalPassed = recentRuns.reduce((s, r) => s + r.passed, 0);
  const totalTests = recentRuns.reduce((s, r) => s + r.totalTests, 0);
  const totalFlaky = recentRuns.reduce((s, r) => s + r.flaky, 0);
  const passRate = totalTests > 0 ? totalPassed / totalTests : 0;
  const flakyRate = totalTests > 0 ? totalFlaky / totalTests : 0;

  const durations = recentRuns
    .map((r) => r.durationMs)
    .filter((d): d is number => d !== null);
  const avgDurationMs =
    durations.length > 0
      ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
      : null;

  // Score: 0-100 based on pass rate and flaky rate
  const score = Math.round(Math.max(0, (passRate * 100) - (flakyRate * 25)));

  // Trend: compare first half vs second half of recent runs
  const half = Math.ceil(recentRuns.length / 2);
  const recentHalf = recentRuns.slice(0, half);
  const olderHalf = recentRuns.slice(half);

  const recentPassRate =
    recentHalf.reduce((s, r) => s + r.passed, 0) /
    Math.max(1, recentHalf.reduce((s, r) => s + r.totalTests, 0));
  const olderPassRate =
    olderHalf.reduce((s, r) => s + r.passed, 0) /
    Math.max(1, olderHalf.reduce((s, r) => s + r.totalTests, 0));

  let trend: "improving" | "declining" | "stable" = "stable";
  if (recentPassRate - olderPassRate > 0.05) trend = "improving";
  else if (olderPassRate - recentPassRate > 0.05) trend = "declining";

  return apiSuccess({
    projectId,
    healthStatus: project.healthStatus,
    score,
    recentRuns: recentRuns.length,
    passRate: Math.round(passRate * 10000) / 100,
    flakyRate: Math.round(flakyRate * 10000) / 100,
    avgDurationMs,
    trend,
    lastRunAt: project.lastRunAt,
    lastIndexedAt: project.lastIndexedAt,
  });
});
