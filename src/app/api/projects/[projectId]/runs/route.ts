import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import { getExecutionQueue } from "@/lib/queue/queues";
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

    // Verify project belongs to workspace
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
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

    // Queue execution jobs
    const testCases = await prisma.testCase.findMany({
      where: { testPlanId, isEnabled: true },
      select: { id: true },
    });

    // Update total test count
    await prisma.testRun.update({
      where: { id: run.id },
      data: { totalTests: testCases.length, startedAt: new Date() },
    });

    const queue = getExecutionQueue();
    for (const tc of testCases) {
      await queue.add(`exec-${run.id}-${tc.id}`, {
        runId: run.id,
        testCaseId: tc.id,
        environmentUrl: environment.url,
        environmentId,
      });
    }

    // Emit run started WebSocket event
    await emitRunStarted(run.id, {
      runId: run.id,
      projectId,
      mode: body.mode ?? "full",
      trigger: "manual",
      totalTests: testCases.length,
    });

    return apiSuccess({ ...run, totalTests: testCases.length }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
