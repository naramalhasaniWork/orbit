import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/rbac";
import { apiSuccess, apiError, handleApiError } from "@/lib/utils/api";
import type { AgentPhase } from "@/generated/prisma/client";

const VALID_PHASES: AgentPhase[] = ["analyst", "planner", "executor", "reporter", "auditor"];

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; agentPhase: string; version: string }> }
) {
  try {
    const { workspaceId, agentPhase, version: versionStr } = await params;
    await requirePermission(workspaceId, "settings.manage");

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
  } catch (error) {
    return handleApiError(error);
  }
}
