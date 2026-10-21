import { apiSuccess, apiError } from "@/lib/utils/api";
import { route } from "@/server/http/route";

// ============================================================
// GET /api/projects/[projectId]/audit/[auditId] — Single audit
// ============================================================

export const GET = route({}, async ({ params: { projectId, auditId }, workspaceId, db }) => {
  const project = await db.project(projectId);

  const audit = await project.auditResult.findFirst({
    where: { id: auditId, projectId },
  });

  if (!audit) {
    return apiError("Audit result not found", "NOT_FOUND", 404);
  }

  return apiSuccess(audit);
});
