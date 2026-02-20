import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import { requirePermission } from "@/lib/auth/rbac";
import { TIER_LIMITS, type WorkspaceTier } from "@/lib/auth/tenant";
import { getDefaultEnvironment } from "@/services/execution/environment-validator";
import { emitRunStarted } from "@/lib/websocket";

// ============================================================
// GET /api/projects/[projectId]/runs — List runs for a project
// ============================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;

    // Verify project belongs to workspace
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const runs = await prisma.testRun.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        mode: true,
        trigger: true,
        totalTests: true,
        passed: true,
        failed: true,
        flaky: true,
        skipped: true,
        creditsConsumed: true,
        branch: true,
        commitSha: true,
        prNumber: true,
        startedAt: true,
        completedAt: true,
        durationMs: true,
        createdAt: true,
      },
    });

    return apiSuccess(runs);
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================
// POST /api/projects/[projectId]/runs — Start a new test run
// ============================================================

interface CreateRunBody {
  environmentId?: string;
  testPlanId?: string;
  mode?: "full" | "smoke" | "regression" | "targeted";
  branch?: string;
  commitSha?: string;
  prNumber?: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { session, workspaceId } = await requireWorkspace();
    const { projectId } = await params;

    // RBAC: require runs.create permission
    await requirePermission(workspaceId, "runs.create");

    // Verify project belongs to workspace
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    // Tier run limit check
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { tier: true, runLimit: true },
    });

    if (workspace) {
      const tier = workspace.tier as WorkspaceTier;
      const limit = TIER_LIMITS[tier]?.runsPerMonth ?? workspace.runLimit;
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const monthlyRuns = await prisma.testRun.count({
        where: {
          project: { workspaceId },
          createdAt: { gte: monthStart },
        },
      });

      if (monthlyRuns >= limit) {
        return apiError(
          `Monthly run limit reached (${limit}). Upgrade your plan for more runs.`,
          "LIMIT_REACHED",
          403
        );
      }
    }

    const body = (await request.json()) as CreateRunBody;

    // Resolve environment
    let environmentId = body.environmentId;
    if (!environmentId) {
      environmentId = await getDefaultEnvironment(projectId) ?? undefined;
    }

    if (!environmentId) {
      return apiError(
        "No environment configured. Add a staging environment first.",
        "NO_ENVIRONMENT",
        400
      );
    }

    // Verify environment exists and is not production
    const environment = await prisma.environment.findFirst({
      where: { id: environmentId, projectId },
      select: { id: true, type: true, url: true },
    });

    if (!environment) {
      return apiError("Environment not found", "NOT_FOUND", 404);
    }

    if (environment.type === "production") {
      return apiError(
        "Cannot run tests against production environments",
        "PRODUCTION_BLOCKED",
        403
      );
    }

    // Find active test plan
    const testPlanId = body.testPlanId ?? (
      await prisma.testPlan.findFirst({
        where: { projectId, isActive: true },
        select: { id: true },
        orderBy: { version: "desc" },
      })
    )?.id;

    if (!testPlanId) {
      return apiError(
        "No active test plan found. Index the repo and generate a plan first.",
        "NO_TEST_PLAN",
        400
      );
    }

    // Create the test run
    const run = await prisma.testRun.create({
      data: {
        projectId,
        environmentId,
        testPlanId,
        status: "queued",
        mode: body.mode ?? "full",
        trigger: "manual",
        triggeredById: session.user.id,
        branch: body.branch,
        commitSha: body.commitSha,
        prNumber: body.prNumber,
      },
    });

    // Count test cases for the response
    const testCaseCount = await prisma.testCase.count({
      where: { testPlanId, isEnabled: true },
    });

    await prisma.testRun.update({
      where: { id: run.id },
      data: { totalTests: testCaseCount },
    });

    // Emit run started WebSocket event
    await emitRunStarted(run.id, {
      runId: run.id,
      projectId,
      mode: body.mode ?? "full",
      trigger: "manual",
      totalTests: testCaseCount,
    });

    // Enqueue a single run execution job (unified path with orchestrator)
    const { getExecutionQueue } = await import("@/lib/queue/queues");
    const queue = getExecutionQueue();
    await queue.add(`run-${run.id}`, {
      runId: run.id,
      testCaseId: "__full_run__",
      environmentUrl: environment.url,
      environmentId,
    });

    return apiSuccess({ ...run, totalTests: testCaseCount }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
