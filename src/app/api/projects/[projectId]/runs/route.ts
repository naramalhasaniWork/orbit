import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { canConsume } from "@/lib/auth/tenant";
import { getDefaultEnvironment } from "@/services/execution/environment-validator";
import { emitRunStarted } from "@/lib/websocket";
import { enqueueOrDiscard } from "@/services/orchestrator/run-launcher";
import { requireQueueAvailable, WORKERS_UNAVAILABLE_MESSAGE } from "@/lib/queue/availability";
import { route } from "@/server/http/route";

// ============================================================
// GET /api/projects/[projectId]/runs — List runs for a project
// ============================================================

export const GET = route({}, async ({ params: { projectId }, workspaceId }) => {
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
      sequenceNumber: true,
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
});

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

export const POST = route(
  { permission: "runs.create" },
  async ({ req: request, params: { projectId }, workspaceId, session }) => {
    // Verify project belongs to workspace
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const allowance = await canConsume(workspaceId, "run");
    if (!allowance.allowed) {
      return apiError(allowance.reason, allowance.code, allowance.code === "NOT_FOUND" ? 404 : 403);
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
      select: { id: true, type: true, url: true, defaultRunMode: true },
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

    // Fail fast before creating a run nothing could pick up.
    await requireQueueAvailable();

    // Create the test run
    const run = await prisma.testRun.create({
      data: {
        projectId,
        environmentId,
        testPlanId,
        status: "queued",
        mode: body.mode ?? (environment.defaultRunMode as "full" | "smoke" | "regression" | "targeted") ?? "full",
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

    // Enqueue a single run execution job (unified path with orchestrator).
    // On failure the run is discarded so it never sits "queued" or counts
    // toward the monthly limit.
    const { getExecutionQueue } = await import("@/lib/queue/queues");
    const enqueued = await enqueueOrDiscard(run.id, () =>
      getExecutionQueue().add(`run-${run.id}`, {
        runId: run.id,
        testCaseId: "__full_run__",
        environmentUrl: environment.url,
        environmentId,
      })
    );
    if (!enqueued.ok) {
      return apiError(WORKERS_UNAVAILABLE_MESSAGE, "WORKERS_UNAVAILABLE", 503);
    }

    await emitRunStarted(run.id, {
      runId: run.id,
      projectId,
      mode: run.mode,
      trigger: "manual",
      totalTests: testCaseCount,
    });

    return apiSuccess({ ...run, totalTests: testCaseCount }, 201);
  }
);
