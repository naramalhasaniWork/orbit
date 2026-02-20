/**
 * Context Loader — loads workspace configuration and builds UserLayerInput
 * for prompt injection. Bridges the database layer and the prompt builder.
 */

import { prisma } from "@/lib/db";
import type { UserLayerInput, WorkspacePromptConfig } from "@/agents/prompts/user-layer";

/**
 * Loads the user-layer context for a project's workspace.
 * Extracts custom prompt, testing rules, technology context, and path configs.
 */
export async function loadUserLayerForProject(
  projectId: string
): Promise<UserLayerInput> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      workspace: { select: { settings: true, name: true } },
    },
  });

  if (!project) {
    return {};
  }

  const settings = (project.workspace?.settings ?? {}) as Record<string, unknown>;

  const workspaceConfig: WorkspacePromptConfig = {
    customPrompt: typeof settings.customPrompt === "string"
      ? settings.customPrompt
      : undefined,
    customRules: Array.isArray(settings.customRules)
      ? (settings.customRules as string[])
      : undefined,
    technologyContext: typeof settings.technologyContext === "string"
      ? settings.technologyContext
      : undefined,
    criticalPaths: Array.isArray(settings.criticalPaths)
      ? (settings.criticalPaths as string[])
      : undefined,
    excludePaths: Array.isArray(settings.excludePaths)
      ? (settings.excludePaths as string[])
      : undefined,
  };

  // Extract project-level overrides from project settings
  const projectSettings = (project.settings ?? {}) as Record<string, unknown>;
  if (Array.isArray(projectSettings.criticalPaths)) {
    workspaceConfig.criticalPaths = [
      ...(workspaceConfig.criticalPaths ?? []),
      ...(projectSettings.criticalPaths as string[]),
    ];
  }
  if (Array.isArray(projectSettings.excludePaths)) {
    workspaceConfig.excludePaths = [
      ...(workspaceConfig.excludePaths ?? []),
      ...(projectSettings.excludePaths as string[]),
    ];
  }

  return { workspaceConfig };
}

/**
 * Gets the workspace name for a project (used in operator prompt).
 */
export async function getWorkspaceName(
  projectId: string
): Promise<string | undefined> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workspace: { select: { name: true } } },
  });
  return project?.workspace?.name;
}
