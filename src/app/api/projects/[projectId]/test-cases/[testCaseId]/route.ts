import { apiSuccess, apiError } from "@/lib/utils/api";
import { route } from "@/server/http/route";

// ============================================================
// GET /api/projects/[projectId]/test-cases/[testCaseId]
// ============================================================

export const GET = route({}, async ({ params: { projectId, testCaseId }, db }) => {
  const project = await db.project(projectId);

  const testCase = await project.testCase.findUnique({
    where: { id: testCaseId },
  });

  if (!testCase) {
    return apiError("Test case not found", "NOT_FOUND", 404);
  }

  return apiSuccess(testCase);
});

// ============================================================
// PATCH /api/projects/[projectId]/test-cases/[testCaseId]
// Edit a test case (name, steps, enabled, critical, etc.)
// ============================================================

interface UpdateTestCaseBody {
  name?: string;
  steps?: unknown;
  rationale?: string;
  edgeCases?: unknown;
  isEnabled?: boolean;
  isCritical?: boolean;
  journey?: string;
  priorityScore?: number;
}

export const PATCH = route(
  { permission: "plans.update" },
  async ({ req: request, params: { projectId, testCaseId }, db }) => {
    const project = await db.project(projectId);

    const existing = await project.testCase.findUnique({
      where: { id: testCaseId },
      select: { id: true },
    });

    if (!existing) {
      return apiError("Test case not found", "NOT_FOUND", 404);
    }

    const body = (await request.json()) as UpdateTestCaseBody;
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim().length === 0) {
        return apiError("Name must be a non-empty string", "VALIDATION_ERROR", 400);
      }
      data.name = body.name.trim();
    }

    if (body.steps !== undefined) {
      if (!Array.isArray(body.steps)) {
        return apiError("Steps must be an array", "VALIDATION_ERROR", 400);
      }
      data.steps = body.steps;
    }

    if (body.rationale !== undefined) {
      data.rationale = typeof body.rationale === "string" ? body.rationale : null;
    }

    if (body.edgeCases !== undefined) {
      data.edgeCases = Array.isArray(body.edgeCases) ? body.edgeCases : [];
    }

    if (body.isEnabled !== undefined) {
      data.isEnabled = Boolean(body.isEnabled);
    }

    if (body.isCritical !== undefined) {
      data.isCritical = Boolean(body.isCritical);
    }

    if (body.journey !== undefined) {
      data.journey = typeof body.journey === "string" ? body.journey : null;
    }

    if (body.priorityScore !== undefined) {
      if (typeof body.priorityScore !== "number" || body.priorityScore < 0 || body.priorityScore > 100) {
        return apiError("Priority score must be 0-100", "VALIDATION_ERROR", 400);
      }
      data.priorityScore = Math.round(body.priorityScore);
    }

    if (Object.keys(data).length === 0) {
      return apiError("No valid fields to update", "VALIDATION_ERROR", 400);
    }

    const updated = await project.testCase.update({
      where: { id: testCaseId },
      data,
    });

    return apiSuccess(updated);
  }
);

// ============================================================
// DELETE /api/projects/[projectId]/test-cases/[testCaseId]
// ============================================================

export const DELETE = route(
  { permission: "plans.update" },
  async ({ params: { projectId, testCaseId }, db }) => {
    const project = await db.project(projectId);

    const existing = await project.testCase.findUnique({
      where: { id: testCaseId },
      select: { id: true },
    });

    if (!existing) {
      return apiError("Test case not found", "NOT_FOUND", 404);
    }

    await project.testCase.delete({ where: { id: testCaseId } });

    return apiSuccess({ deleted: true });
  }
);
