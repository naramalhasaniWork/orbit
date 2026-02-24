import { prisma } from "@/lib/db";
import { subDays } from "date-fns";

interface TrendData {
  passRate: number;
  flakyCount: number;
  coverage: number;
  duration: number;
}

interface SparklineData {
  passRate: number[];
  flakyCount: number[];
  coverage: number[];
  duration: number[];
}

interface DashboardStats {
  passRate: number;
  flakyCount: number;
  coverage: number;
  lastDuration: number;
  trends: TrendData;
  sparklines: SparklineData;
}

interface ActiveRun {
  id: string;
  status: string;
  trigger: string;
  mode: string;
  totalTests: number;
  passed: number;
  failed: number;
  flaky: number;
  projectId: string;
}

export async function computeDashboardStats(projectId: string): Promise<DashboardStats> {
  const now = new Date();
  const sevenDaysAgo = subDays(now, 7);
  const fourteenDaysAgo = subDays(now, 14);

  // Get completed runs from the last 14 days for sparklines + trends
  const recentCompletedRuns = await prisma.testRun.findMany({
    where: {
      projectId,
      status: "completed",
      completedAt: { gte: fourteenDaysAgo },
    },
    orderBy: { completedAt: "asc" },
    select: {
      passed: true,
      failed: true,
      flaky: true,
      totalTests: true,
      durationMs: true,
      completedAt: true,
    },
  });

  // Current stats from most recent run
  const latestRun = recentCompletedRuns[recentCompletedRuns.length - 1];
  const latestExecuted = latestRun
    ? latestRun.passed + latestRun.failed + latestRun.flaky
    : 0;
  const passRate = latestExecuted > 0
    ? Math.round((latestRun.passed / latestExecuted) * 100)
    : 0;
  const lastDuration = latestRun?.durationMs ?? 0;

  const flakyCount = await prisma.flakyTest.count({
    where: { projectId, isQuarantined: false },
  });

  const [totalNodes, coveredJourneys] = await Promise.all([
    prisma.systemMapNode.count({ where: { projectId } }),
    prisma.testCase.groupBy({
      by: ["journey"],
      where: { projectId, isEnabled: true },
    }),
  ]);
  const coverage = totalNodes > 0
    ? Math.round((coveredJourneys.length / totalNodes) * 100)
    : 0;

  // Compute sparklines (last 14 data points from runs)
  const sparklineRuns = recentCompletedRuns.slice(-14);
  const sparklines: SparklineData = {
    passRate: sparklineRuns.map((r) => {
      const executed = r.passed + r.failed + r.flaky;
      return executed > 0 ? Math.round((r.passed / executed) * 100) : 0;
    }),
    flakyCount: sparklineRuns.map((r) => r.flaky),
    coverage: sparklineRuns.length > 0 ? sparklineRuns.map(() => coverage) : [],
    duration: sparklineRuns.map((r) => r.durationMs ? r.durationMs / 1000 : 0),
  };

  // Compute trends (this week vs last week)
  const thisWeekRuns = recentCompletedRuns.filter(
    (r) => r.completedAt && r.completedAt >= sevenDaysAgo
  );
  const lastWeekRuns = recentCompletedRuns.filter(
    (r) => r.completedAt && r.completedAt < sevenDaysAgo
  );

  const trends = computeTrends(thisWeekRuns, lastWeekRuns);

  return {
    passRate,
    flakyCount,
    coverage,
    lastDuration,
    trends,
    sparklines,
  };
}

function computeTrends(
  thisWeek: { passed: number; failed: number; totalTests: number; flaky: number; durationMs: number | null }[],
  lastWeek: { passed: number; failed: number; totalTests: number; flaky: number; durationMs: number | null }[]
): TrendData {
  const avgPassRate = (runs: typeof thisWeek) => {
    const valid = runs.filter((r) => (r.passed + r.failed + r.flaky) > 0);
    if (valid.length === 0) return 0;
    return valid.reduce((sum, r) => {
      const executed = r.passed + r.failed + r.flaky;
      return sum + (r.passed / executed) * 100;
    }, 0) / valid.length;
  };

  const avgFlaky = (runs: typeof thisWeek) => {
    if (runs.length === 0) return 0;
    return runs.reduce((sum, r) => sum + r.flaky, 0) / runs.length;
  };

  const avgDuration = (runs: typeof thisWeek) => {
    const valid = runs.filter((r) => r.durationMs != null && r.durationMs > 0);
    if (valid.length === 0) return 0;
    return valid.reduce((sum, r) => sum + (r.durationMs ?? 0), 0) / valid.length;
  };

  const thisPassRate = avgPassRate(thisWeek);
  const lastPassRate = avgPassRate(lastWeek);
  const thisFlaky = avgFlaky(thisWeek);
  const lastFlaky = avgFlaky(lastWeek);
  const thisDuration = avgDuration(thisWeek);
  const lastDuration = avgDuration(lastWeek);

  return {
    passRate: lastPassRate > 0 ? ((thisPassRate - lastPassRate) / lastPassRate) * 100 : 0,
    flakyCount: lastFlaky > 0 ? ((thisFlaky - lastFlaky) / lastFlaky) * 100 : 0,
    coverage: 0, // Coverage trend is computed differently (based on nodes, not runs)
    duration: lastDuration > 0 ? ((thisDuration - lastDuration) / lastDuration) * 100 : 0,
  };
}

export async function getActiveRun(projectId: string): Promise<ActiveRun | null> {
  const run = await prisma.testRun.findFirst({
    where: {
      projectId,
      status: { in: ["executing", "indexing", "planning", "queued"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      trigger: true,
      mode: true,
      totalTests: true,
      passed: true,
      failed: true,
      flaky: true,
      projectId: true,
    },
  });

  return run;
}

export function computeHealthStatus(
  runs: { passed: number; failed: number; flaky: number; totalTests: number }[]
): "healthy" | "degraded" | "failing" {
  const lastFive = runs.slice(0, 5);
  if (lastFive.length === 0) return "healthy";

  const failedRuns = lastFive.filter((r) => r.failed > 0).length;
  const flakyRuns = lastFive.filter((r) => r.flaky > 0 && r.failed === 0).length;

  if (failedRuns >= 3) return "failing";
  if (failedRuns >= 1 || flakyRuns >= 2) return "degraded";
  return "healthy";
}
