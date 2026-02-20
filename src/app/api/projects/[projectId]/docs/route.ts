import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import {
  generateBehaviorDocs,
  generateEnhancedDocs,
} from "@/services/reporting/test-documentation";

// ============================================================
// GET /api/projects/[projectId]/docs
// Generate behavior documentation from test plans
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
  } catch (error) {
    return handleApiError(error);
  }
}
