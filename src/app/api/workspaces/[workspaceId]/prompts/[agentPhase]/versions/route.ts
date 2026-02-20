import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/rbac";
import { apiSuccess, apiError, handleApiError } from "@/lib/utils/api";
import type { AgentPhase } from "@/generated/prisma/client";

const VALID_PHASES: AgentPhase[] = ["analyst", "planner", "executor", "reporter", "auditor"];
const CONTENT_PREVIEW_LENGTH = 200;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; agentPhase: string }> }
) {
  try {
    const { workspaceId, agentPhase } = await params;
    await requirePermission(workspaceId, "settings.view");

    if (!VALID_PHASES.includes(agentPhase as AgentPhase)) {
      return apiError(
        "Invalid agentPhase. Must be one of: analyst, planner, executor, reporter, auditor",
        "VALIDATION_ERROR",
        400
      );
    }

    const versions = await prisma.promptVersion.findMany({
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
  } catch (error) {
    return handleApiError(error);
  }
}
