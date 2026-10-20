/**
 * Environment facts for the Orbit Agent. The agent once told a user no
 * staging environment existed because it only saw environments flagged
 * isDefault; this lists every environment the project actually has.
 */

import { prisma } from "@/lib/db";
import { getDefaultEnvironment } from "@/services/execution/environment-validator";
import type { ToolDefinition } from "@/server/ai/types";

export interface AgentEnvironment {
  id: string;
  name: string;
  type: string;
  url: string;
  isDefault: boolean;
  /** The environment run_tests will target (default, else first non-production). */
  usedForRuns: boolean;
}

export async function listProjectEnvironments(
  projectId: string,
  workspaceId: string
): Promise<AgentEnvironment[]> {
  const [environments, runEnvironmentId] = await Promise.all([
    prisma.environment.findMany({
      where: { projectId, project: { workspaceId, deletedAt: null } },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { id: true, name: true, type: true, url: true, isDefault: true },
    }),
    getDefaultEnvironment(projectId),
  ]);
  return environments.map((e) => ({ ...e, usedForRuns: e.id === runEnvironmentId }));
}

/** One line per environment for the system prompt. */
export function describeEnvironments(environments: AgentEnvironment[]): string {
  if (environments.length === 0) return "None configured";
  return environments
    .map((e) => `${e.name} [${e.type}] ${e.url}${e.usedForRuns ? " (used for test runs)" : ""}`)
    .join("; ");
}

export const ENVIRONMENT_TOOLS: ToolDefinition[] = [
  {
    name: "list_environments",
    description:
      "List every environment configured for this project (name, type such as staging/preview/qa/production, URL, and which one test runs target). Call this before answering any question about environments.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
];

export const environmentHandlers = {
  list_environments: async (
    _args: Record<string, unknown>,
    ctx: { projectId: string; workspaceId: string }
  ) => {
    const environments = await listProjectEnvironments(ctx.projectId, ctx.workspaceId);
    return { count: environments.length, environments };
  },
};
