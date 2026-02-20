/**
 * RAG Context Injector — retrieves relevant domain knowledge
 * for each agent phase and formats it for prompt injection.
 */

import { searchKnowledge } from "./embedder";
import type { AgentPhase } from "@/generated/prisma/client";

/** Knowledge file types mapped to their Prisma enum values. */
type KnowledgeType =
  | "openapi"
  | "markdown"
  | "design_system"
  | "business_rules"
  | "test_credentials"
  | "other";

/** Which knowledge types are relevant to each agent phase. */
const PHASE_RELEVANCE: Record<AgentPhase, KnowledgeType[]> = {
  analyst: ["openapi", "markdown", "business_rules", "other"],
  planner: ["openapi", "business_rules", "markdown", "other"],
  executor: ["openapi", "design_system", "test_credentials", "other"],
  reporter: ["design_system", "business_rules", "markdown", "other"],
  auditor: ["business_rules", "openapi", "markdown", "other"],
};

/** Labels for each knowledge type in the prompt. */
const TYPE_LABELS: Record<KnowledgeType, string> = {
  openapi: "API Documentation",
  markdown: "Documentation",
  design_system: "Design System",
  business_rules: "Business Rules",
  test_credentials: "Test Credentials",
  other: "Reference Material",
};

const DEFAULT_MAX_TOKENS = 2000;
const MIN_RELEVANCE_SCORE = 0.7;
const CHARS_PER_TOKEN = 4;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

interface KnowledgeResult {
  content: string;
  score: number;
  fileType: string;
  fileName: string;
  section?: string;
}

/**
 * Filter search results by agent phase relevance and minimum score.
 */
function filterByPhase(
  results: KnowledgeResult[],
  phase: AgentPhase
): KnowledgeResult[] {
  const relevantTypes = PHASE_RELEVANCE[phase];
  return results.filter(
    (r) =>
      r.score >= MIN_RELEVANCE_SCORE &&
      relevantTypes.includes(r.fileType as KnowledgeType)
  );
}

/**
 * Group results by knowledge type for structured prompt output.
 */
function groupByType(
  results: KnowledgeResult[]
): Map<string, KnowledgeResult[]> {
  const groups = new Map<string, KnowledgeResult[]>();
  for (const result of results) {
    const existing = groups.get(result.fileType) ?? [];
    existing.push(result);
    groups.set(result.fileType, existing);
  }
  return groups;
}

/**
 * Format grouped results into a structured prompt section.
 */
function formatAsPromptSection(
  grouped: Map<string, KnowledgeResult[]>,
  maxTokens: number
): string {
  const sections: string[] = ["## Domain Knowledge"];
  let tokenCount = estimateTokens("## Domain Knowledge\n\n");

  for (const [fileType, results] of Array.from(grouped.entries())) {
    const label = TYPE_LABELS[fileType as KnowledgeType] ?? "Reference";
    const header = `### ${label}`;
    const headerTokens = estimateTokens(header + "\n\n");

    if (tokenCount + headerTokens > maxTokens) break;

    sections.push(header);
    tokenCount += headerTokens;

    for (const result of results) {
      const sourceNote = result.section
        ? `[Source: ${result.fileName} > ${result.section}]`
        : `[Source: ${result.fileName}]`;
      const entry = `${result.content}\n${sourceNote}`;
      const entryTokens = estimateTokens(entry + "\n\n");

      if (tokenCount + entryTokens > maxTokens) break;

      sections.push(entry);
      tokenCount += entryTokens;
    }
  }

  return sections.length > 1 ? sections.join("\n\n") : "";
}

/**
 * Retrieve relevant domain knowledge for an agent's current task.
 * Searches the workspace's knowledge base using the project context,
 * filters by agent phase relevance and similarity score,
 * then formats as a prompt section within the token budget.
 */
export async function getRelevantKnowledge(
  workspaceId: string,
  agentPhase: AgentPhase,
  projectContext: string,
  maxTokens: number = DEFAULT_MAX_TOKENS
): Promise<string> {
  if (!projectContext.trim()) return "";

  // Search for relevant chunks — fetch more than needed, then filter
  const searchResults = await searchKnowledge(workspaceId, projectContext, 20);

  if (searchResults.length === 0) return "";

  // Filter by phase relevance and minimum score
  const filtered = filterByPhase(searchResults, agentPhase);

  if (filtered.length === 0) return "";

  // Group by type for structured output
  const grouped = groupByType(filtered);

  // Format within token budget
  return formatAsPromptSection(grouped, maxTokens);
}
