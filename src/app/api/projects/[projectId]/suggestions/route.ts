import { apiSuccess, apiError } from "@/lib/utils/api";
import { requireQueueAvailable } from "@/lib/queue/availability";
import { generateRuleSuggestions, mergeSuggestions } from "@/services/ai-suggestions/suggestion-engine";
import { getLLMSuggestions, requestSuggestionRefresh } from "@/services/ai-suggestions/suggestion-cache";
import type { Suggestion } from "@/services/ai-suggestions/suggestion-types";
import { route } from "@/server/http/route";

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

export const GET = route({}, async ({ params: { projectId }, workspaceId, db }) => {
  await db.project(projectId);

  const [ruleBased, llm] = await Promise.all([
    generateRuleSuggestions(projectId),
    getLLMSuggestions(projectId),
  ]);

  return apiSuccess({
    projectId,
    suggestions: mergeSuggestions(ruleBased, llm.suggestions).map(toResponse),
    ai: { status: llm.status, generatedAt: llm.generatedAt, stale: llm.stale },
  });
});

// ============================================================
// POST /api/projects/[projectId]/suggestions — regenerate AI suggestions
// ============================================================

export const POST = route(
  { permission: "plans.create" },
  async ({ params: { projectId }, workspaceId, db }) => {
    await db.project(projectId);

    await requireQueueAvailable();
    const queued = await requestSuggestionRefresh(projectId);
    return apiSuccess({ status: "pending", alreadyPending: !queued }, 202);
  }
);
