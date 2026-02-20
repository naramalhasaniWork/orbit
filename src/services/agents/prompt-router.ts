/**
 * Prompt Router — maps sub-agent types to their prompt builders.
 * Each sub-agent type has a dedicated prompt builder that takes
 * its specific context shape and returns a system prompt string.
 */

import {
  buildSelectorFinderPrompt,
  type SelectorFinderContext,
} from "@/agents/prompts/sub-agents/selector-finder";
import {
  buildApiValidatorPrompt,
  type ApiValidatorContext,
} from "@/agents/prompts/sub-agents/api-validator";
import {
  buildAuthSpecialistPrompt,
  type AuthSpecialistContext,
} from "@/agents/prompts/sub-agents/auth-specialist";
import {
  buildVisualAnalyzerPrompt,
  type VisualAnalyzerContext,
} from "@/agents/prompts/sub-agents/visual-analyzer";
import {
  buildJourneyAnalyzerPrompt,
  type JourneyAnalyzerContext,
} from "@/agents/prompts/sub-agents/journey-analyzer";
import {
  buildCodeReviewerPrompt,
  type CodeReviewerContext,
} from "@/agents/prompts/sub-agents/code-reviewer";

/**
 * Union of all sub-agent context types.
 * Used for type-safe dispatch in the prompt router.
 */
type SubAgentContextMap = {
  "selector-finder": SelectorFinderContext;
  "api-validator": ApiValidatorContext;
  "auth-specialist": AuthSpecialistContext;
  "visual-analyzer": VisualAnalyzerContext;
  "journey-analyzer": JourneyAnalyzerContext;
  "code-reviewer": CodeReviewerContext;
};

type SubAgentType = keyof SubAgentContextMap;

/**
 * Map of sub-agent type to its prompt builder function.
 */
const PROMPT_BUILDERS: Record<
  SubAgentType,
  (context: Record<string, unknown>) => string
> = {
  "selector-finder": (ctx) =>
    buildSelectorFinderPrompt(ctx as unknown as SelectorFinderContext),
  "api-validator": (ctx) =>
    buildApiValidatorPrompt(ctx as unknown as ApiValidatorContext),
  "auth-specialist": (ctx) =>
    buildAuthSpecialistPrompt(ctx as unknown as AuthSpecialistContext),
  "visual-analyzer": (ctx) =>
    buildVisualAnalyzerPrompt(ctx as unknown as VisualAnalyzerContext),
  "journey-analyzer": (ctx) =>
    buildJourneyAnalyzerPrompt(ctx as unknown as JourneyAnalyzerContext),
  "code-reviewer": (ctx) =>
    buildCodeReviewerPrompt(ctx as unknown as CodeReviewerContext),
};

/**
 * Build a system prompt for a sub-agent given its type and context.
 * Returns null if the sub-agent type has no registered prompt builder.
 */
export function buildSubAgentPrompt(
  agentType: string,
  context: Record<string, unknown>
): string | null {
  const builder = PROMPT_BUILDERS[agentType as SubAgentType];
  if (!builder) return null;
  return builder(context);
}

/**
 * Check if a prompt builder exists for a given sub-agent type.
 */
export function hasPromptBuilder(agentType: string): boolean {
  return agentType in PROMPT_BUILDERS;
}

export type { SubAgentContextMap, SubAgentType };
