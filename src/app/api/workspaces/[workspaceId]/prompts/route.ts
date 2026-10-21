import { apiSuccess } from "@/lib/utils/api";
import type { AgentPhase } from "@/server/data/types";
import { route } from "@/server/http/route";

const VALID_PHASES: AgentPhase[] = ["analyst", "planner", "executor", "reporter", "auditor"];

export const GET = route(
  { workspace: "param", permission: "settings.view" },
  async ({ workspaceId, db }) => {
    const versions = await db.promptVersion.findMany({
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
  }
);
