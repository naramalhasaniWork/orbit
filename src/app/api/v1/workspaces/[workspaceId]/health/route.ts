import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiKey } from "@/lib/auth/api-key";

// ============================================================
// GET /api/v1/workspaces/[workspaceId]/health — Overall test health
// ============================================================

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const auth = await requireApiKey(req);
  if (auth instanceof NextResponse) return auth;

  const { workspaceId } = await params;

  if (auth.workspaceId !== workspaceId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const projects = await prisma.project.findMany({
    where: { workspaceId, status: "active" },
    select: {
      id: true,
      name: true,
      healthStatus: true,
      lastRunAt: true,
      lastIndexedAt: true,
    },
  });

  const projectIds = projects.map((p) => p.id);

  const recentRuns = await prisma.testRun.findMany({
    where: {
      projectId: { in: projectIds },
      status: "completed",
    },
    orderBy: { completedAt: "desc" },
    take: 50,
    select: {
      projectId: true,
      passed: true,
      failed: true,
      flaky: true,
      totalTests: true,
    },
  });

  const totalPassed = recentRuns.reduce((s, r) => s + r.passed, 0);
  const totalFailed = recentRuns.reduce((s, r) => s + r.failed, 0);
  const totalFlaky = recentRuns.reduce((s, r) => s + r.flaky, 0);
  const totalTests = recentRuns.reduce((s, r) => s + r.totalTests, 0);
  const passRate =
    totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : null;

  const activeRuns = await prisma.testRun.count({
    where: {
      projectId: { in: projectIds },
      status: {
        in: ["queued", "indexing", "planning", "executing", "reporting"],
      },
    },
  });

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { creditBalance: true, monthlyCredits: true },
  });

  const healthy = projects.filter((p) => p.healthStatus === "healthy").length;
  const degraded = projects.filter(
    (p) => p.healthStatus === "degraded"
  ).length;
  const failing = projects.filter((p) => p.healthStatus === "failing").length;

  return NextResponse.json({
    data: {
      workspaceId,
      totalProjects: projects.length,
      healthyProjects: healthy,
      degradedProjects: degraded,
      failingProjects: failing,
      activeRuns,
      passRate,
      totalPassed,
      totalFailed,
      totalFlaky,
      creditBalance: workspace?.creditBalance ?? 0,
      monthlyCredits: workspace?.monthlyCredits ?? 0,
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        healthStatus: p.healthStatus,
        lastRunAt: p.lastRunAt,
        lastIndexedAt: p.lastIndexedAt,
      })),
    },
  });
}
