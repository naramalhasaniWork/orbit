/**
 * Prompt Builder — composes the full prompt for each agent.
 * Combines operator layer + agent-specific instructions + user layer.
 * Handles context injection, token budgeting, and prompt caching hints.
 */

import { getOperatorPrompt } from "@/agents/prompts/operator-layer";
import { buildUserLayer, type UserLayerInput } from "@/agents/prompts/user-layer";
import { DEFAULT_USER_PROMPTS } from "@/agents/prompts/default-prompts";
import { prisma } from "@/lib/db";
import type { AgentPhase } from "@/generated/prisma/client";

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

// In-memory cache for custom prompts with 60-second TTL
interface CachedPrompt {
  content: string | null;
  fetchedAt: number;
}

const CACHE_TTL_MS = 60_000;
const promptCache = new Map<string, CachedPrompt>();

function getCacheKey(workspaceId: string, agentPhase: AgentPhase): string {
  return `${workspaceId}:${agentPhase}`;
}

/**
 * Gets the active custom prompt for a workspace+phase.
 * Returns the custom content if one exists, or null to use the default.
 * Results are cached for 60 seconds to avoid DB hits on every agent call.
 */
export async function getActivePrompt(
  workspaceId: string,
  agentPhase: AgentPhase
): Promise<string | null> {
  const key = getCacheKey(workspaceId, agentPhase);
  const cached = promptCache.get(key);

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.content;
  }

  const version = await prisma.promptVersion.findFirst({
    where: {
      workspaceId,
      agentPhase,
      promptType: "user",
      isActive: true,
    },
    select: { content: true },
  });

  const content = version?.content ?? null;
  promptCache.set(key, { content, fetchedAt: Date.now() });
  return content;
}

/**
 * Returns the effective user prompt for a workspace+phase:
 * custom if set, otherwise the default.
 */
export async function getEffectivePrompt(
  workspaceId: string,
  agentPhase: AgentPhase
): Promise<string> {
  const custom = await getActivePrompt(workspaceId, agentPhase);
  return custom ?? DEFAULT_USER_PROMPTS[agentPhase];
}

/**
 * Invalidate cached prompt for a workspace+phase.
 * Call this after saving a new version or reverting to default.
 */
export function invalidatePromptCache(workspaceId: string, agentPhase: AgentPhase): void {
  promptCache.delete(getCacheKey(workspaceId, agentPhase));
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
 * Builds a prompt with workspace-aware custom prompt lookup.
 * Async version that checks the DB for custom prompts before assembling.
 */
export async function buildPromptWithCustom(
  workspaceId: string,
  input: Omit<PromptBuilderInput, "userLayer"> & { userLayer?: UserLayerInput }
): Promise<BuiltPrompt> {
  const customContent = await getActivePrompt(workspaceId, input.agentRole);

  const userLayer: UserLayerInput = {
    ...input.userLayer,
    workspaceConfig: {
      ...input.userLayer?.workspaceConfig,
      customPrompt: customContent
        ?? input.userLayer?.workspaceConfig?.customPrompt
        ?? DEFAULT_USER_PROMPTS[input.agentRole],
    },
  };

  return buildPrompt({ ...input, userLayer });
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
