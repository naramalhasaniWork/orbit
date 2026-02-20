import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";

// ============================================================
// Cron validation (basic)
// ============================================================

function isValidCron(expression: string): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length < 5 || parts.length > 6) return false;
  // Basic check: each part should match cron field patterns
  const fieldPattern = /^(\*|[0-9]+(-[0-9]+)?(,[0-9]+(-[0-9]+)?)*)(\/([\d]+))?$/;
  return parts.every((p) => fieldPattern.test(p));
}

function getNextRunTime(cron: string): Date | null {
  // Simple heuristic: parse the hour and minute fields for common patterns
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return null;

  const minute = parseInt(parts[0], 10);
  const hour = parseInt(parts[1], 10);

  if (isNaN(minute) || isNaN(hour)) return null;

  const now = new Date();
  const next = new Date();
  next.setHours(hour, minute, 0, 0);

  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

// ============================================================
// GET /api/projects/[projectId]/schedules
// ============================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const schedules = await prisma.$queryRaw<Array<{
      id: string;
      name: string;
      cron_expression: string;
      mode: string;
      environment_id: string | null;
      is_enabled: boolean;
      last_run_at: Date | null;
      next_run_at: Date | null;
      created_at: Date;
    }>>`
      SELECT id, name, cron_expression, mode, environment_id, is_enabled, last_run_at, next_run_at, created_at
      FROM scheduled_runs
      WHERE project_id = ${projectId}::uuid
      ORDER BY created_at ASC
    `;

    return apiSuccess(
      schedules.map((s) => ({
        id: s.id,
        name: s.name,
        cronExpression: s.cron_expression,
        mode: s.mode,
        environmentId: s.environment_id,
        isEnabled: s.is_enabled,
        lastRunAt: s.last_run_at?.toISOString() ?? null,
        nextRunAt: s.next_run_at?.toISOString() ?? null,
        createdAt: s.created_at.toISOString(),
      }))
    );
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================
// POST /api/projects/[projectId]/schedules
// ============================================================

interface CreateScheduleBody {
  name?: string;
  cronExpression?: string;
  mode?: string;
  environmentId?: string;
}

const VALID_MODES = new Set(["full", "smoke", "regression"]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const body = (await request.json()) as CreateScheduleBody;

    if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
      return apiError("Schedule name is required", "VALIDATION_ERROR", 400);
    }

    if (!body.cronExpression || typeof body.cronExpression !== "string") {
      return apiError("Cron expression is required", "VALIDATION_ERROR", 400);
    }

    if (!isValidCron(body.cronExpression)) {
      return apiError(
        "Invalid cron expression. Expected 5 or 6 fields (e.g., '0 2 * * *')",
        "VALIDATION_ERROR",
        400
      );
    }

    const mode = body.mode && VALID_MODES.has(body.mode) ? body.mode : "smoke";
    const nextRunAt = getNextRunTime(body.cronExpression);

    const result = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO scheduled_runs (id, project_id, name, cron_expression, mode, environment_id, is_enabled, next_run_at, created_at, updated_at)
      VALUES (gen_random_uuid(), ${projectId}::uuid, ${body.name.trim()}, ${body.cronExpression.trim()}, ${mode}::"RunMode", ${body.environmentId ?? null}::uuid, true, ${nextRunAt}, NOW(), NOW())
      RETURNING id
    `;

    return apiSuccess(
      {
        id: result[0]?.id,
        name: body.name.trim(),
        cronExpression: body.cronExpression.trim(),
        mode,
        environmentId: body.environmentId ?? null,
        isEnabled: true,
        nextRunAt: nextRunAt?.toISOString() ?? null,
      },
      201
    );
  } catch (error) {
    return handleApiError(error);
  }
}
