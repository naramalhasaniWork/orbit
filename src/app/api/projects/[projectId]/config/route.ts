import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import {
  getProjectConfig,
  saveProjectConfig,
  generateConfigTemplate,
  validateConfig,
} from "@/services/planning/orbit-config";
import { requirePermission } from "@/lib/auth/rbac";

// ============================================================
// GET /api/projects/[projectId]/config — Get orbit config
// ============================================================

export async function GET(
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

    const searchParams = request.nextUrl.searchParams;
    if (searchParams.get("template") === "true") {
      return apiSuccess({ template: generateConfigTemplate() });
    }

    const config = await getProjectConfig(projectId);
    return apiSuccess(config);
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================
// PUT /api/projects/[projectId]/config — Update orbit config
// ============================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    await requirePermission(workspaceId, "settings.manage");
    const { projectId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const body = await request.json();

    if (!body || typeof body !== "object") {
      return apiError("Request body must be a JSON object", "VALIDATION_ERROR", 400);
    }

    // Validate first
    const validation = validateConfig(body as Record<string, unknown>);
    if (!validation.valid) {
      return apiSuccess({
        config: validation.config,
        errors: validation.errors,
        valid: false,
      });
    }

    const { config, errors } = await saveProjectConfig(
      projectId,
      body as Record<string, unknown>
    );

    return apiSuccess({ config, errors, valid: errors.length === 0 });
  } catch (error) {
    return handleApiError(error);
  }
}
