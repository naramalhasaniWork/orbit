import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import { requireQueueAvailable } from "@/lib/queue/availability";
import { requirePermission } from "@/lib/auth/rbac";
import { generateRuleSuggestions, mergeSuggestions } from "@/services/ai-suggestions/suggestion-engine";
import { getLLMSuggestions, requestSuggestionRefresh } from "@/services/ai-suggestions/suggestion-cache";
import type { Suggestion } from "@/services/ai-suggestions/suggestion-types";

async function findProject(projectId: string, workspaceId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true },
  });
}

// Map to API response shape (UI expects `type` not `category`)
const toResponse = (s: Suggestion) => ({
  id: s.id,
  type: s.category,
  severity: s.severity,
  title: s.title,
  description: s.description,
  actionLabel: s.actionLabel,
  actionType: s.actionType,
  actionable: s.actionable,
  metadata: s.metadata,
});

// ============================================================
// GET /api/projects/[projectId]/suggestions
// Rule-based suggestions computed now, plus cached LLM suggestions. Never
// waits on an LLM: a cache miss queues a background refresh.
// ============================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;

    if (!(await findProject(projectId, workspaceId))) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const [ruleBased, llm] = await Promise.all([
      generateRuleSuggestions(projectId),
      getLLMSuggestions(projectId),
    ]);

    return apiSuccess({
      projectId,
      suggestions: mergeSuggestions(ruleBased, llm.suggestions).map(toResponse),
      ai: { status: llm.status, generatedAt: llm.generatedAt, stale: llm.stale },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================
// POST /api/projects/[projectId]/suggestions — regenerate AI suggestions
// ============================================================

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    // Regenerating spends model tokens, so viewers cannot trigger it
    await requirePermission(workspaceId, "plans.create");
    const { projectId } = await params;

    if (!(await findProject(projectId, workspaceId))) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    await requireQueueAvailable();
    const queued = await requestSuggestionRefresh(projectId);
    return apiSuccess({ status: "pending", alreadyPending: !queued }, 202);
  } catch (error) {
    return handleApiError(error);
  }
}
