import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { createRunWithinAllowance } from "@/services/orchestrator/run-launcher";
import { runVisualTest } from "@/services/visual-qa/visual-test-runner";
import { getDefaultEnvironment } from "@/services/execution/environment-validator";
import { route } from "@/server/http/route";

// ============================================================
// POST /api/projects/[projectId]/visual-tests
// Trigger a visual test for a specific route
// ============================================================

interface VisualTestBody {
  routePath: string;
  environmentId?: string;
  runId?: string;
  checkBrand?: boolean;
  diffThreshold?: number;
}

export const POST = route(
  { permission: "runs.create" },
  async ({ req: request, params: { projectId }, workspaceId }) => {
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const body = (await request.json()) as VisualTestBody;

    if (!body.routePath) {
      return apiError("routePath is required", "VALIDATION_ERROR", 400);
    }

    // Resolve environment URL
    const environmentId = body.environmentId ?? await getDefaultEnvironment(projectId);
    const environment = environmentId && await prisma.environment.findFirst({
      where: { id: environmentId, projectId },
      select: { id: true, url: true, type: true },
    });

    if (!environment) {
      return apiError(
        "No environment found. Add a staging environment first.",
        "NO_ENVIRONMENT",
        400
      );
    }

    if (environment.type === "production") {
      return apiError(
        "Cannot run visual tests against production environments",
        "PRODUCTION_BLOCKED",
        403
      );
    }

    // Attach to the caller's run (it must be this project's), or create one under the workspace allowance
    let runId = body.runId;
    if (runId) {
      const existing = await prisma.testRun.findFirst({ where: { id: runId, projectId }, select: { id: true } });
      if (!existing) return apiError("Run not found", "NOT_FOUND", 404);
    } else {
      const created = await createRunWithinAllowance(workspaceId, {
        projectId,
        environmentId: environment.id,
        status: "executing",
        mode: "targeted",
        trigger: "manual",
        startedAt: new Date(),
      });
      if ("blocked" in created) {
        const { blocked } = created;
        return apiError(blocked.reason, blocked.code, blocked.code === "NOT_FOUND" ? 404 : 403);
      }
      runId = created.run.id;
    }

    const result = await runVisualTest({
      runId,
      projectId,
      routePath: body.routePath,
      environmentUrl: environment.url,
      checkBrand: body.checkBrand,
      diffThreshold: body.diffThreshold,
    });

    // If we created a run, complete it
    if (!body.runId) {
      await prisma.testRun.update({
        where: { id: runId },
        data: {
          status: "completed",
          completedAt: new Date(),
          totalTests: 1,
          passed: result.passed ? 1 : 0,
          failed: result.passed ? 0 : 1,
        },
      });
    }

    return apiSuccess({ result, runId }, 201);
  }
);
