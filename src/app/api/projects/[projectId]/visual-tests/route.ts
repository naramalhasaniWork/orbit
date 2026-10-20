import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import { runVisualTest } from "@/services/visual-qa/visual-test-runner";
import { requirePermission } from "@/lib/auth/rbac";

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    await requirePermission(workspaceId, "runs.create");
    const { projectId } = await params;

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
    const envWhere: Record<string, unknown> = { projectId };
    if (body.environmentId) {
      envWhere.id = body.environmentId;
    } else {
      envWhere.isDefault = true;
    }

    const environment = await prisma.environment.findFirst({
      where: envWhere,
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

    // Resolve or create a run to attach artifacts to
    let runId = body.runId;
    if (!runId) {
      const run = await prisma.testRun.create({
        data: {
          projectId,
          environmentId: environment.id,
          status: "executing",
          mode: "targeted",
          trigger: "manual",
          startedAt: new Date(),
        },
      });
      runId = run.id;
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
  } catch (error) {
    return handleApiError(error);
  }
}
