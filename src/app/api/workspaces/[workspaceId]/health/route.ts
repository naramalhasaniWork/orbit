import { NextRequest } from "next/server";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import { forWorkspace } from "@/server/data/scope";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId: sessionWorkspaceId } = await requireWorkspace();
    const { workspaceId } = await params;
    const db = forWorkspace(workspaceId);

    // Ensure the user can only access their own workspace
    if (workspaceId !== sessionWorkspaceId) {
      return apiError("Forbidden", "FORBIDDEN", 403);
    }

    const projects = await db.project.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        healthStatus: true,
        lastRunAt: true,
        lastIndexedAt: true,
      },
    });

    // Get recent runs across all projects in the workspace
    const projectIds = projects.map((p) => p.id);

    const recentRuns = await db.testRun.findMany({
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
        completedAt: true,
      },
    });

    const totalPassed = recentRuns.reduce((s, r) => s + r.passed, 0);
    const totalFailed = recentRuns.reduce((s, r) => s + r.failed, 0);
    const totalFlaky = recentRuns.reduce((s, r) => s + r.flaky, 0);
    const totalTests = recentRuns.reduce((s, r) => s + r.totalTests, 0);
    const passRate = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : null;

    const activeRuns = await db.testRun.count({
      where: {
        projectId: { in: projectIds },
        status: { in: ["queued", "indexing", "planning", "executing", "reporting"] },
      },
    });

    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { creditBalance: true, monthlyCredits: true },
    });

    const healthyProjects = projects.filter((p) => p.healthStatus === "healthy").length;
    const degradedProjects = projects.filter((p) => p.healthStatus === "degraded").length;
    const failingProjects = projects.filter((p) => p.healthStatus === "failing").length;

    return apiSuccess({
      workspaceId,
      totalProjects: projects.length,
      healthyProjects,
      degradedProjects,
      failingProjects,
      recentRuns: recentRuns.length,
      activeRuns,
      totalPassed,
      totalFailed,
      totalFlaky,
      passRate,
      creditBalance: workspace?.creditBalance ?? 0,
      monthlyCredits: workspace?.monthlyCredits ?? 0,
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        healthStatus: p.healthStatus,
        lastRunAt: p.lastRunAt,
        lastIndexedAt: p.lastIndexedAt,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
