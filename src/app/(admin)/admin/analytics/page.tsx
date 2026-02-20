import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AnalyticsClient } from "@/components/admin/analytics-client";

export default async function AdminAnalyticsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    totalWorkspaces,
    totalUsers,
    totalRuns,
    recentRuns,
    newUsers,
    newWorkspaces,
  ] = await Promise.all([
    prisma.workspace.count(),
    prisma.user.count(),
    prisma.testRun.count(),
    prisma.testRun.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
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
    prisma.user.groupBy({
      by: ["createdAt"],
      where: { createdAt: { gte: thirtyDaysAgo } },
      _count: true,
    }),
    prisma.workspace.groupBy({
      by: ["createdAt"],
      where: { createdAt: { gte: thirtyDaysAgo } },
      _count: true,
    }),
  ]);

  // Build daily run stats
  const dailyRunMap = new Map<string, {
    runs: number;
    passed: number;
    failed: number;
    credits: number;
  }>();

  for (const run of recentRuns) {
    const day = run.createdAt.toISOString().slice(0, 10);
    const existing = dailyRunMap.get(day) ?? {
      runs: 0,
      passed: 0,
      failed: 0,
      credits: 0,
    };
    existing.runs += 1;
    existing.passed += run.passed;
    existing.failed += run.failed;
    existing.credits += run.creditsConsumed;
    dailyRunMap.set(day, existing);
  }

  const dailyRunStats = Array.from(dailyRunMap.entries())
    .map(([date, stats]) => ({ date, ...stats }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Build daily user growth
  const dailyUserMap = new Map<string, number>();
  for (const entry of newUsers) {
    const day = entry.createdAt.toISOString().slice(0, 10);
    dailyUserMap.set(day, (dailyUserMap.get(day) ?? 0) + entry._count);
  }

  const userGrowth = Array.from(dailyUserMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Build daily workspace growth
  const dailyWsMap = new Map<string, number>();
  for (const entry of newWorkspaces) {
    const day = entry.createdAt.toISOString().slice(0, 10);
    dailyWsMap.set(day, (dailyWsMap.get(day) ?? 0) + entry._count);
  }

  const workspaceGrowth = Array.from(dailyWsMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalCredits = recentRuns.reduce((s, r) => s + r.creditsConsumed, 0);

  return (
    <AnalyticsClient
      overview={{
        totalWorkspaces,
        totalUsers,
        totalRuns,
        runsLast30Days: recentRuns.length,
        creditsLast30Days: totalCredits,
      }}
      dailyRunStats={dailyRunStats}
      userGrowth={userGrowth}
      workspaceGrowth={workspaceGrowth}
    />
  );
}
