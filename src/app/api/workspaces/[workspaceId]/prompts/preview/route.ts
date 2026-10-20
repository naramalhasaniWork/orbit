import { apiSuccess, apiError } from "@/lib/utils/api";
import { buildPrompt, estimateTokens } from "@/agents/prompts/prompt-builder";
import type { AgentPhase } from "@/generated/prisma/client";
import { route } from "@/server/http/route";

const VALID_PHASES: AgentPhase[] = ["analyst", "planner", "executor", "reporter", "auditor"];
const MAX_CONTENT_LENGTH = 50000;

export const POST = route(
  { workspace: "param", permission: "settings.view" },
  async ({ req: request, workspaceId }) => {
    const body = (await request.json()) as { agentPhase?: string; content?: string };

    if (!body.agentPhase || !VALID_PHASES.includes(body.agentPhase as AgentPhase)) {
      return apiError(
        "Invalid agentPhase. Must be one of: analyst, planner, executor, reporter, auditor",
        "VALIDATION_ERROR",
        400
      );
    }

    if (!body.content || body.content.trim().length === 0) {
      return apiError("content cannot be empty", "VALIDATION_ERROR", 400);
    }

    if (body.content.length > MAX_CONTENT_LENGTH) {
      return apiError(
        `content exceeds maximum length of ${MAX_CONTENT_LENGTH} characters`,
        "VALIDATION_ERROR",
        400
      );
    }

    const assembled = buildPrompt({
      agentRole: body.agentPhase as AgentPhase,
      agentInstructions: "",
      userLayer: {
        workspaceConfig: { customPrompt: body.content },
      },
    });

    return apiSuccess({
      assembled: assembled.systemPrompt,
      estimatedTokens: estimateTokens(assembled.systemPrompt),
    });
  }
);
