import type { RunMode } from "@/server/data/types";
import { apiSuccess, apiError } from "@/lib/utils/api";
import {
  isValidCronExpression,
  getNextCronDate,
} from "@/services/scheduler/cron-parser";
import { route } from "@/server/http/route";

// ============================================================
// GET /api/projects/[projectId]/schedules
// ============================================================

export const GET = route({}, async ({ params: { projectId }, workspaceId, db }) => {
  const project = await db.project(projectId);

  const schedules = await project.scheduledRun.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });

  return apiSuccess(
    schedules.map((s) => ({
      id: s.id,
      name: s.name,
      cronExpression: s.cronExpression,
      mode: s.mode,
      environmentId: s.environmentId,
      isEnabled: s.isEnabled,
      lastRunAt: s.lastRunAt?.toISOString() ?? null,
      nextRunAt: s.nextRunAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    }))
  );
});

// ============================================================
// POST /api/projects/[projectId]/schedules
// ============================================================

interface CreateScheduleBody {
  name?: string;
  cronExpression?: string;
  mode?: string;
  environmentId?: string;
}

const VALID_MODES = new Map<string, RunMode>([
  ["full", "full"],
  ["smoke", "smoke"],
  ["regression", "regression"],
]);

export const POST = route(
  { permission: "runs.create" },
  async ({ req: request, params: { projectId }, workspaceId, db }) => {
    const project = await db.project(projectId);

    const body = (await request.json()) as CreateScheduleBody;

    if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
      return apiError("Schedule name is required", "VALIDATION_ERROR", 400);
    }

    if (!body.cronExpression || typeof body.cronExpression !== "string") {
      return apiError("Cron expression is required", "VALIDATION_ERROR", 400);
    }

    if (!isValidCronExpression(body.cronExpression)) {
      return apiError(
        "Invalid cron expression. Expected 5 fields (e.g., '0 2 * * *')",
        "VALIDATION_ERROR",
        400
      );
    }

    const mode = VALID_MODES.get(body.mode ?? "") ?? "smoke";
    const nextRunAt = getNextCronDate(body.cronExpression);

    const schedule = await project.scheduledRun.create({
      data: {
        projectId,
        name: body.name.trim(),
        cronExpression: body.cronExpression.trim(),
        mode,
        environmentId: body.environmentId ?? null,
        isEnabled: true,
        nextRunAt,
      },
    });

    return apiSuccess(
      {
        id: schedule.id,
        name: schedule.name,
        cronExpression: schedule.cronExpression,
        mode: schedule.mode,
        environmentId: schedule.environmentId,
        isEnabled: schedule.isEnabled,
        lastRunAt: schedule.lastRunAt?.toISOString() ?? null,
        nextRunAt: schedule.nextRunAt?.toISOString() ?? null,
      },
      201
    );
  }
);

// ============================================================
// PATCH /api/projects/[projectId]/schedules — toggle enabled
// ============================================================

interface PatchScheduleBody {
  scheduleId?: string;
  isEnabled?: boolean;
}

export const PATCH = route(
  { permission: "runs.create" },
  async ({ req: request, params: { projectId }, workspaceId, db }) => {
    const project = await db.project(projectId);

    const body = (await request.json()) as PatchScheduleBody;

    if (!body.scheduleId) {
      return apiError("scheduleId is required", "VALIDATION_ERROR", 400);
    }

    if (typeof body.isEnabled !== "boolean") {
      return apiError("isEnabled must be a boolean", "VALIDATION_ERROR", 400);
    }

    const existing = await project.scheduledRun.findFirst({
      where: { id: body.scheduleId, projectId },
    });

    if (!existing) {
      return apiError("Schedule not found", "NOT_FOUND", 404);
    }

    // If re-enabling, recalculate nextRunAt
    const nextRunAt = body.isEnabled
      ? getNextCronDate(existing.cronExpression)
      : existing.nextRunAt;

    const updated = await project.scheduledRun.update({
      where: { id: body.scheduleId },
      data: {
        isEnabled: body.isEnabled,
        nextRunAt,
      },
    });

    return apiSuccess({
      id: updated.id,
      isEnabled: updated.isEnabled,
      nextRunAt: updated.nextRunAt?.toISOString() ?? null,
    });
  }
);

// ============================================================
// DELETE /api/projects/[projectId]/schedules
// ============================================================

export const DELETE = route(
  { permission: "runs.create" },
  async ({ req: request, params: { projectId }, workspaceId, db }) => {
    const project = await db.project(projectId);

    const { searchParams } = new URL(request.url);
    const scheduleId = searchParams.get("scheduleId");

    if (!scheduleId) {
      return apiError("scheduleId query param is required", "VALIDATION_ERROR", 400);
    }

    const existing = await project.scheduledRun.findFirst({
      where: { id: scheduleId, projectId },
    });

    if (!existing) {
      return apiError("Schedule not found", "NOT_FOUND", 404);
    }

    await project.scheduledRun.delete({
      where: { id: scheduleId },
    });

    return apiSuccess({ deleted: true });
  }
);
