import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { cancelRun } from "@/services/orchestrator/run-manager";
import { route } from "@/server/http/route";
import { PERSON_SELECT, toPersonView } from "@/lib/avatar/resolve";

// ============================================================
// GET /api/projects/[projectId]/runs/[runId] — Get run details
// ============================================================

export const GET = route({}, async ({ params: { projectId, runId }, db }) => {
  const project = await db.project(projectId);

  const run = await project.testRun.findUnique({
    where: { id: runId },
    include: {
      results: {
        include: {
          testCase: {
            select: {
              id: true,
              name: true,
              type: true,
              journey: true,
              priorityScore: true,
              isCritical: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      environment: {
        select: {
          id: true,
          name: true,
          type: true,
          url: true,
        },
      },
      triggeredBy: { select: PERSON_SELECT },
    },
  });

  if (!run) {
    return apiError("Test run not found", "NOT_FOUND", 404);
  }

  return apiSuccess({ ...run, triggeredBy: run.triggeredBy ? toPersonView(run.triggeredBy) : null });
});

// ============================================================
// PATCH /api/projects/[projectId]/runs/[runId] — Update run (cancel)
// ============================================================

const PatchRunSchema = z.object({
  status: z.enum(["cancelled"]),
});

export const PATCH = route(
  { permission: "runs.cancel" },
  async ({ req: request, params: { projectId, runId }, db }) => {
    const project = await db.project(projectId);
    // cancelRun works by run id alone, so the run must be this project's first
    const run = await project.testRun.findUnique({ where: { id: runId }, select: { id: true } });
    if (!run) {
      return apiError("Test run not found", "NOT_FOUND", 404);
    }

    const body = PatchRunSchema.parse(await request.json());

    if (body.status === "cancelled") {
      const cancelled = await cancelRun(runId);
      if (!cancelled) {
        return apiError("Run cannot be cancelled (already completed or not found)", "INVALID_STATE", 409);
      }
      return apiSuccess({ id: runId, status: "cancelled" });
    }

    return apiError("Invalid status", "INVALID_INPUT", 400);
  }
);
