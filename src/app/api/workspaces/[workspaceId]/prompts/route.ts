import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/rbac";
import { apiSuccess, handleApiError } from "@/lib/utils/api";
import type { AgentPhase } from "@/generated/prisma/client";

const VALID_PHASES: AgentPhase[] = ["analyst", "planner", "executor", "reporter", "auditor"];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    await requirePermission(workspaceId, "settings.view");

    const versions = await prisma.promptVersion.findMany({
      where: { workspaceId, promptType: "user" },
      select: {
        agentPhase: true,
        isActive: true,
        version: true,
        createdAt: true,
      },
    });

    const phaseMap = new Map<AgentPhase, typeof versions>();
    for (const v of versions) {
      const list = phaseMap.get(v.agentPhase) ?? [];
      list.push(v);
      phaseMap.set(v.agentPhase, list);
    }

    const result = VALID_PHASES.map((phase) => {
      const phaseVersions = phaseMap.get(phase) ?? [];
      const activeVersion = phaseVersions.find((v) => v.isActive);
      const lastUpdated = phaseVersions.length > 0
        ? phaseVersions.reduce((latest, v) =>
            v.createdAt > latest.createdAt ? v : latest
          ).createdAt
        : null;

      return {
        agentPhase: phase,
        hasCustomPrompt: !!activeVersion,
        activeVersion: activeVersion?.version ?? null,
        versionCount: phaseVersions.length,
        lastUpdated,
      };
    });

    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
