import { apiSuccess, apiError } from "@/lib/utils/api";
import type { AgentPhase } from "@/server/data/types";
import { route } from "@/server/http/route";

const VALID_PHASES: AgentPhase[] = ["analyst", "planner", "executor", "reporter", "auditor"];
const CONTENT_PREVIEW_LENGTH = 200;

export const GET = route(
  { workspace: "param", permission: "settings.view" },
  async ({ params: { agentPhase }, workspaceId, db }) => {
    if (!VALID_PHASES.includes(agentPhase as AgentPhase)) {
      return apiError(
        "Invalid agentPhase. Must be one of: analyst, planner, executor, reporter, auditor",
        "VALIDATION_ERROR",
        400
      );
    }

    const versions = await db.promptVersion.findMany({
      where: {
        workspaceId,
        agentPhase: agentPhase as AgentPhase,
        promptType: "user",
      },
      orderBy: { version: "desc" },
      include: {
        createdBy: { select: { name: true, email: true } },
      },
    });

    const result = versions.map((v) => ({
      version: v.version,
      contentPreview: v.content.length > CONTENT_PREVIEW_LENGTH
        ? v.content.slice(0, CONTENT_PREVIEW_LENGTH) + "..."
        : v.content,
      changelog: v.changelog,
      isActive: v.isActive,
      createdBy: v.createdBy?.name ?? v.createdBy?.email ?? null,
      createdAt: v.createdAt,
    }));

    return apiSuccess(result);
  }
);
