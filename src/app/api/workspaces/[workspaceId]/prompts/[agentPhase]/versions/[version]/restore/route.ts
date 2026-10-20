import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/utils/api";
import type { AgentPhase } from "@/generated/prisma/client";
import { route } from "@/server/http/route";

const VALID_PHASES: AgentPhase[] = ["analyst", "planner", "executor", "reporter", "auditor"];

export const POST = route(
  { workspace: "param", permission: "settings.manage" },
  async ({ params: { agentPhase, version: versionStr }, workspaceId }) => {
    if (!VALID_PHASES.includes(agentPhase as AgentPhase)) {
      return apiError(
        "Invalid agentPhase. Must be one of: analyst, planner, executor, reporter, auditor",
        "VALIDATION_ERROR",
        400
      );
    }

    const versionNum = parseInt(versionStr, 10);
    if (isNaN(versionNum) || versionNum < 1) {
      return apiError("Invalid version number", "VALIDATION_ERROR", 400);
    }

    const targetVersion = await prisma.promptVersion.findFirst({
      where: {
        workspaceId,
        agentPhase: agentPhase as AgentPhase,
        promptType: "user",
        version: versionNum,
      },
    });

    if (!targetVersion) {
      return apiError("Version not found", "NOT_FOUND", 404);
    }

    const restored = await prisma.$transaction(async (tx) => {
      await tx.promptVersion.updateMany({
        where: {
          workspaceId,
          agentPhase: agentPhase as AgentPhase,
          promptType: "user",
          isActive: true,
        },
        data: { isActive: false },
      });

      return tx.promptVersion.update({
        where: { id: targetVersion.id },
        data: { isActive: true },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });
    });

    return apiSuccess(restored);
  }
);
