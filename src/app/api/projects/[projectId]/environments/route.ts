import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import { requirePermission } from "@/lib/auth/rbac";

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

    const environments = await prisma.environment.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });

    return apiSuccess(environments);
  } catch (error) {
    return handleApiError(error);
  }
}

const ENVIRONMENT_TYPES = ["staging", "preview", "qa", "production"] as const;
const RUN_MODES = ["full", "smoke", "regression"] as const;

const CreateEnvironmentSchema = z.object({
  name: z.string().min(1, "Environment name is required").max(100),
  type: z.enum(ENVIRONMENT_TYPES).optional().default("staging"),
  url: z.string().url("Must be a valid URL").optional(),
  baseUrl: z.string().url("Must be a valid URL").optional(),
  teardownHookUrl: z.string().url().optional(),
  isDefault: z.boolean().optional().default(false),
  defaultRunMode: z.enum(RUN_MODES).optional().default("full"),
}).refine(
  (data) => data.url || data.baseUrl,
  { message: "Environment URL is required (url or baseUrl)", path: ["url"] }
);

/**
 * Project secrets are sent to whatever URL an environment points at, so creating or
 * re-pointing one needs secrets.manage, not just projects.update.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    await requirePermission(workspaceId, "secrets.manage");
    const { projectId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const body = await request.json();
    const parsed = CreateEnvironmentSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message ?? "Validation failed";
      return apiError(firstError, "VALIDATION_ERROR", 400);
    }

    const { name, type, url, baseUrl, teardownHookUrl, isDefault, defaultRunMode } = parsed.data;
    const resolvedUrl = url ?? baseUrl!;

    const environment = await prisma.environment.create({
      data: {
        projectId,
        name: name.trim(),
        type,
        url: resolvedUrl,
        teardownHookUrl,
        isDefault,
        defaultRunMode,
      },
    });

    return apiSuccess(environment, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================
// PATCH /api/projects/[projectId]/environments — Update an environment
// ============================================================

const UpdateEnvironmentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(ENVIRONMENT_TYPES).optional(),
  url: z.string().url("Must be a valid URL").optional(),
  defaultRunMode: z.enum(RUN_MODES).optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    await requirePermission(workspaceId, "projects.update");
    const { projectId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const body = await request.json();
    const { id: envId, ...rest } = body;
    const parsed = UpdateEnvironmentSchema.safeParse(rest);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message ?? "Validation failed";
      return apiError(firstError, "VALIDATION_ERROR", 400);
    }

    if (!envId) {
      return apiError("Environment ID is required", "VALIDATION_ERROR", 400);
    }

    const env = await prisma.environment.findFirst({
      where: { id: envId, projectId },
    });

    if (!env) {
      return apiError("Environment not found", "NOT_FOUND", 404);
    }

    if (parsed.data.url !== undefined && parsed.data.url !== env.url) {
      await requirePermission(workspaceId, "secrets.manage");
    }

    // If setting as default, unset other defaults first
    if (parsed.data.isDefault) {
      await prisma.environment.updateMany({
        where: { projectId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.environment.update({
      where: { id: envId },
      data: parsed.data,
    });

    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
