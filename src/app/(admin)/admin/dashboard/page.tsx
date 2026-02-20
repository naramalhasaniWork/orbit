import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AdminDashboardClient } from "@/components/admin/admin-dashboard-client";

export default async function AdminDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const [
    totalWorkspaces,
    totalUsers,
    totalProjects,
    totalRuns,
    activeRuns,
    recentFailedRuns,
  ] = await Promise.all([
    prisma.workspace.count(),
    prisma.user.count(),
    prisma.project.count(),
    prisma.testRun.count(),
    prisma.testRun.count({
      where: {
        status: {
          in: ["queued", "indexing", "planning", "executing", "reporting"],
        },
      },
    }),
    prisma.testRun.count({
      where: {
        status: "failed",
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  // Compute error rate from last 100 runs
  const last100Runs = await prisma.testRun.findMany({
    where: { status: "completed" },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { totalTests: true, failed: true },
  });

  const totalTests = last100Runs.reduce((s, r) => s + r.totalTests, 0);
  const totalFailed = last100Runs.reduce((s, r) => s + r.failed, 0);
  const errorRate = totalTests > 0 ? Math.round((totalFailed / totalTests) * 10000) / 100 : 0;

  // Recent runs for activity feed
  const recentRuns = await prisma.testRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      project: { select: { name: true, slug: true } },
      triggeredBy: { select: { name: true, email: true } },
    },
  });

  return (
    <AdminDashboardClient
      stats={{
        totalWorkspaces,
        totalUsers,
        totalProjects,
        totalRuns,
        activeRuns,
        recentFailedRuns,
        errorRate,
      }}
      recentRuns={recentRuns.map((r) => ({
        id: r.id,
        status: r.status,
        projectName: r.project.name,
        triggeredBy: r.triggeredBy?.name ?? r.triggeredBy?.email ?? "System",
        totalTests: r.totalTests,
        passed: r.passed,
        failed: r.failed,
        createdAt: r.createdAt.toISOString(),
      }))}
    />
  );
}
