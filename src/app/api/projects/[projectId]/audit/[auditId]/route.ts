import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { route } from "@/server/http/route";

// ============================================================
// GET /api/projects/[projectId]/audit/[auditId] — Single audit
// ============================================================

export const GET = route({}, async ({ params: { projectId, auditId }, workspaceId }) => {
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true },
  });

  if (!project) {
    return apiError("Project not found", "NOT_FOUND", 404);
  }

  const audit = await prisma.auditResult.findFirst({
    where: { id: auditId, projectId },
  });

  if (!audit) {
    return apiError("Audit result not found", "NOT_FOUND", 404);
  }

  return apiSuccess(audit);
});
