import { apiSuccess, apiError } from "@/lib/utils/api";
import {
  getProjectMappings,
  approveMapping,
  revokeMapping,
} from "@/services/execution/selector-memory";
import { route } from "@/server/http/route";

// ============================================================
// GET /api/projects/[projectId]/selectors
// ============================================================

export const GET = route({}, async ({ req: request, params: { projectId }, workspaceId, db }) => {
  const project = await db.project(projectId);

  const approvedOnly = request.nextUrl.searchParams.get("approved") === "true";
  const mappings = await getProjectMappings(projectId, { approvedOnly });

  return apiSuccess({ mappings });
});

// ============================================================
// PATCH /api/projects/[projectId]/selectors
// Approve or revoke a selector mapping
// ============================================================

export const PATCH = route(
  { permission: "plans.update" },
  async ({ req: request, params: { projectId }, workspaceId, db }) => {
    const project = await db.project(projectId);

    const body = await request.json();
    const { mappingId, action } = body as {
      mappingId: string;
      action: "approve" | "revoke" | "delete";
    };

    if (!mappingId || !action) {
      return apiError("mappingId and action are required", "VALIDATION_ERROR", 400);
    }

    const mapping = await project.selectorMapping.findFirst({
      where: { id: mappingId, projectId },
    });

    if (!mapping) {
      return apiError("Mapping not found", "NOT_FOUND", 404);
    }

    if (action === "approve") {
      await approveMapping(mappingId);
    } else if (action === "revoke") {
      await revokeMapping(mappingId);
    } else if (action === "delete") {
      await revokeMapping(mappingId, true);
    }

    return apiSuccess({ mappingId, action });
  }
);
