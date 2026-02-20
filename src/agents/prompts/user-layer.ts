/**
 * User Layer — workspace-customizable prompt context.
 * Appended to the operator layer prompt for each agent.
 * Includes domain knowledge, custom rules, and plugin context.
 */

interface WorkspacePromptConfig {
  /** Free-form domain knowledge from workspace admin */
  customPrompt?: string;
  /** Application-specific rules (e.g. "Always verify permissions") */
  customRules?: string[];
  /** Technology context (e.g. "We use Auth0 for authentication") */
  technologyContext?: string;
  /** Critical paths that must always be tested */
  criticalPaths?: string[];
  /** Paths to exclude from testing */
  excludePaths?: string[];
}

interface PluginContext {
  pluginName: string;
  contextSnippet: string;
}

interface RetrievedDocument {
  title: string;
  content: string;
  relevanceScore: number;
}

export interface UserLayerInput {
  workspaceConfig?: WorkspacePromptConfig;
  pluginContexts?: PluginContext[];
  retrievedDocuments?: RetrievedDocument[];
}

export function buildUserLayer(input: UserLayerInput): string {
  const sections: string[] = [];

  const { workspaceConfig, pluginContexts, retrievedDocuments } = input;

  // Workspace custom prompt
  if (workspaceConfig?.customPrompt) {
    sections.push(`## Application Context (Workspace-Provided)
${workspaceConfig.customPrompt}`);
  }

  // Custom testing rules
  if (workspaceConfig?.customRules?.length) {
    const rules = workspaceConfig.customRules
      .map((r, i) => `${i + 1}. ${r}`)
      .join("\n");
    sections.push(`## Custom Testing Rules
${rules}`);
  }

  // Technology context
  if (workspaceConfig?.technologyContext) {
    sections.push(`## Technology Context
${workspaceConfig.technologyContext}`);
  }

  // Critical paths
  if (workspaceConfig?.criticalPaths?.length) {
    const paths = workspaceConfig.criticalPaths
      .map((p) => `- \`${p}\``)
      .join("\n");
    sections.push(`## Critical Paths (Must Always Cover)
${paths}`);
  }

  // Exclude paths
  if (workspaceConfig?.excludePaths?.length) {
    const paths = workspaceConfig.excludePaths
      .map((p) => `- \`${p}\``)
      .join("\n");
    sections.push(`## Excluded Paths (Do Not Test)
${paths}`);
  }

  // Plugin-injected context
  if (pluginContexts?.length) {
    for (const plugin of pluginContexts) {
      sections.push(`## Plugin Context: ${plugin.pluginName}
${plugin.contextSnippet}`);
    }
  }

  // Retrieved documents (from pgvector semantic search)
  if (retrievedDocuments?.length) {
    const docs = retrievedDocuments
      .filter((d) => d.relevanceScore > 0.5)
      .slice(0, 5)
      .map((d) => `### ${d.title} (relevance: ${(d.relevanceScore * 100).toFixed(0)}%)
${d.content}`)
      .join("\n\n");

    if (docs) {
      sections.push(`## Retrieved Documentation
${docs}`);
    }
  }

  return sections.join("\n\n");
}

export type { WorkspacePromptConfig, PluginContext, RetrievedDocument };
