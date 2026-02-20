/**
 * Prompt Builder — composes the full prompt for each agent.
 * Combines operator layer + agent-specific instructions + user layer.
 * Handles context injection, token budgeting, and prompt caching hints.
 */

import { getOperatorPrompt } from "@/agents/prompts/operator-layer";
import { buildUserLayer, type UserLayerInput } from "@/agents/prompts/user-layer";

type AgentRole = "analyst" | "planner" | "executor" | "reporter" | "auditor";

interface PromptBuilderInput {
  agentRole: AgentRole;
  agentInstructions: string;
  userLayer?: UserLayerInput;
  /** RAG-retrieved domain knowledge to inject between operator and agent layers */
  domainKnowledge?: string;
  workspaceName?: string;
  maxOutputTokens?: number;
}

interface BuiltPrompt {
  /** Full system prompt: operator + agent + user layers */
  systemPrompt: string;
  /** Cacheable prefix (operator + user layers change infrequently) */
  cacheablePrefix: string;
  /** Dynamic suffix (agent instructions change per invocation) */
  dynamicSuffix: string;
}

/**
 * Builds a complete prompt by composing all layers.
 * The structure is designed so that the operator + user layers form a
 * stable prefix suitable for prompt caching (60-90% cost reduction),
 * while agent-specific instructions vary per call.
 */
export function buildPrompt(input: PromptBuilderInput): BuiltPrompt {
  const {
    agentRole,
    agentInstructions,
    userLayer,
    domainKnowledge,
    workspaceName,
    maxOutputTokens,
  } = input;

  const operatorPrompt = getOperatorPrompt({
    agentRole,
    workspaceName,
    maxOutputTokens,
  });

  const userContext = userLayer ? buildUserLayer(userLayer) : "";

  // Cacheable prefix: operator layer + user context (stable across calls)
  const cacheableParts = [operatorPrompt];
  if (userContext) cacheableParts.push(userContext);
  const cacheablePrefix = cacheableParts.join("\n\n");

  // Domain knowledge sits between the cacheable prefix and agent instructions.
  // It varies per invocation based on RAG retrieval, so it's part of the dynamic section.
  const dynamicParts: string[] = [];
  if (domainKnowledge) dynamicParts.push(domainKnowledge);
  dynamicParts.push(agentInstructions);
  const dynamicSuffix = dynamicParts.join("\n\n");

  const systemPrompt = `${cacheablePrefix}\n\n${dynamicSuffix}`;

  return { systemPrompt, cacheablePrefix, dynamicSuffix };
}

/**
 * Estimates the token count of a string.
 * Rough approximation: ~4 characters per token for English text.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Trims context to fit within a token budget.
 * Preserves the most important content by trimming from the end of
 * lower-priority sections.
 */
export function trimToTokenBudget(text: string, maxTokens: number): string {
  const estimated = estimateTokens(text);
  if (estimated <= maxTokens) return text;

  const ratio = maxTokens / estimated;
  const maxChars = Math.floor(text.length * ratio * 0.95); // 5% safety margin
  return text.slice(0, maxChars) + "\n\n[Content trimmed to fit token budget]";
}

export type { AgentRole, PromptBuilderInput, BuiltPrompt };
export type { UserLayerInput } from "@/agents/prompts/user-layer";
