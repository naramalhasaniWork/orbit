import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import { generateSuggestions } from "@/services/ai-suggestions/suggestion-engine";

// ============================================================
// GET /api/projects/[projectId]/suggestions — AI suggestions
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

    // Allow skipping LLM suggestions for faster responses
    const skipLLM = request.nextUrl.searchParams.get("fast") === "true";
    const suggestions = await generateSuggestions(projectId, !skipLLM);

    // Map to API response shape (UI expects `type` not `category`)
    const mapped = suggestions.map((s) => ({
      id: s.id,
      type: s.category,
      severity: s.severity,
      title: s.title,
      description: s.description,
      actionLabel: s.actionLabel,
      actionType: s.actionType,
      actionable: s.actionable,
      metadata: s.metadata,
    }));

    return apiSuccess({
      projectId,
      suggestions: mapped,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
