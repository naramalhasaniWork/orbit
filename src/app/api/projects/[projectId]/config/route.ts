import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/utils/api";
import {
  getProjectConfig,
  saveProjectConfig,
  generateConfigTemplate,
  validateConfig,
} from "@/services/planning/orbit-config";
import { route } from "@/server/http/route";

// ============================================================
// GET /api/projects/[projectId]/config — Get orbit config
// ============================================================

export const GET = route({}, async ({ req: request, params: { projectId }, workspaceId }) => {
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
});

// ============================================================
// PUT /api/projects/[projectId]/config — Update orbit config
// ============================================================

export const PUT = route(
  { permission: "settings.manage" },
  async ({ req: request, params: { projectId }, workspaceId }) => {
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
  }
);
