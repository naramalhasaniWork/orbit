import { apiSuccess, apiError } from "@/lib/utils/api";
import {
  generateBehaviorDocs,
  generateEnhancedDocs,
} from "@/services/reporting/test-documentation";
import { route } from "@/server/http/route";

// ============================================================
// GET /api/projects/[projectId]/docs
// Generate behavior documentation from test plans
// ============================================================

export const GET = route({}, async ({ req: request, params: { projectId }, workspaceId, db }) => {
  const project = await db.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true, name: true },
  });

  if (!project) {
    return apiError("Project not found", "NOT_FOUND", 404);
  }

  const planId = request.nextUrl.searchParams.get("planId") ?? undefined;
  const format = request.nextUrl.searchParams.get("format") ?? "structured";

  if (format === "markdown") {
    const markdown = await generateEnhancedDocs(projectId, planId);
    return apiSuccess({ format: "markdown", content: markdown });
  }

  const specs = await generateBehaviorDocs(projectId, planId);
  return apiSuccess({ format: "structured", specs });
});
