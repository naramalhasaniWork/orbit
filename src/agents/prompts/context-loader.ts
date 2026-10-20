/**
 * Context Loader — loads workspace configuration and builds UserLayerInput
 * for prompt injection. Bridges the database layer and the prompt builder.
 */

import { prisma } from "@/lib/db";
import { activeProjectNotes } from "@/server/data/project-note-repo";
import { parseProjectSettings, parseWorkspaceSettings } from "@/server/data/settings-repo";
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

  const settings = parseWorkspaceSettings(project.workspace?.settings);

  const workspaceConfig: WorkspacePromptConfig = {
    customPrompt: settings.customPrompt,
    customRules: settings.customRules,
    technologyContext: settings.technologyContext,
    criticalPaths: settings.criticalPaths,
    excludePaths: settings.excludePaths,
  };

  // Extract project-level overrides from project settings
  const projectSettings = parseProjectSettings(project.settings);
  if (projectSettings.criticalPaths) {
    workspaceConfig.criticalPaths = [...(workspaceConfig.criticalPaths ?? []), ...projectSettings.criticalPaths];
  }
  if (projectSettings.excludePaths) {
    workspaceConfig.excludePaths = [...(workspaceConfig.excludePaths ?? []), ...projectSettings.excludePaths];
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

/**
 * Loads active testing notes for a project.
 * These are user-supplied context injected into planner/executor prompts.
 */
export interface TestingNote {
  id: string;
  content: string;
  category: "context" | "instruction" | "known-issue" | "credential-hint";
  active: boolean;
}

export async function loadTestingNotes(
  projectId: string
): Promise<TestingNote[]> {
  return activeProjectNotes(projectId);
}
