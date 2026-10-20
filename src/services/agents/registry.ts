/**
 * Sub-Agent Registry — defines available sub-agent types and their capabilities.
 * Sub-agents are lightweight, focused agents that parent agents can delegate
 * specialized tasks to (e.g. selector finding, API validation, visual analysis).
 */

import { modelForTier } from "@/server/ai/model-catalog";
import type { AgentRole } from "@/agents/prompts/prompt-builder";

type AgentPhase = AgentRole;

export interface SubAgentDefinition {
  /** Unique identifier for this sub-agent type */
  type: string;
  /** Human-readable description of what this sub-agent does */
  description: string;
  /** Which pipeline phase this sub-agent operates in (for billing) */
  agentPhase: AgentPhase;
  /** Default model to use — cheapest sufficient model per task */
  defaultModel: string;
  /** Maximum output tokens for this sub-agent */
  maxTokens: number;
  /** Whether this sub-agent can spawn its own children */
  canSpawnChildren: boolean;
}

const SUB_AGENT_REGISTRY: Record<string, SubAgentDefinition> = {
  "selector-finder": {
    type: "selector-finder",
    description: "Finds the best CSS/XPath selector for a UI element",
    agentPhase: "executor",
    defaultModel: modelForTier("fast"),
    maxTokens: 2000,
    canSpawnChildren: false,
  },
  "api-validator": {
    type: "api-validator",
    description:
      "Validates API endpoints return expected schema and status codes",
    agentPhase: "executor",
    defaultModel: modelForTier("balanced"),
    maxTokens: 4000,
    canSpawnChildren: false,
  },
  "auth-specialist": {
    type: "auth-specialist",
    description:
      "Handles authentication flows — login, OAuth, session management",
    agentPhase: "executor",
    defaultModel: modelForTier("balanced"),
    maxTokens: 4000,
    canSpawnChildren: false,
  },
  "visual-analyzer": {
    type: "visual-analyzer",
    description:
      "Analyzes screenshots for visual regressions and brand consistency",
    agentPhase: "reporter",
    defaultModel: modelForTier("balanced"),
    maxTokens: 4000,
    canSpawnChildren: false,
  },
  "journey-analyzer": {
    type: "journey-analyzer",
    description:
      "Analyzes complex multi-step user journeys and identifies edge cases",
    agentPhase: "planner",
    defaultModel: modelForTier("balanced"),
    maxTokens: 8000,
    canSpawnChildren: false,
  },
  "code-reviewer": {
    type: "code-reviewer",
    description:
      "Reviews code changes for quality, security, and best practices",
    agentPhase: "analyst",
    defaultModel: modelForTier("balanced"),
    maxTokens: 8000,
    canSpawnChildren: false,
  },
};

/**
 * Look up a sub-agent definition by type.
 * Returns null if the type is not registered.
 */
export function getSubAgentDef(type: string): SubAgentDefinition | null {
  return SUB_AGENT_REGISTRY[type] ?? null;
}

/**
 * List all registered sub-agent definitions.
 */
export function listSubAgents(): SubAgentDefinition[] {
  return Object.values(SUB_AGENT_REGISTRY);
}

/**
 * Check if a sub-agent type exists in the registry.
 */
export function isValidSubAgentType(type: string): boolean {
  return type in SUB_AGENT_REGISTRY;
}

/**
 * Get sub-agents filtered by pipeline phase.
 */
export function getSubAgentsByPhase(phase: AgentPhase): SubAgentDefinition[] {
  return Object.values(SUB_AGENT_REGISTRY).filter(
    (def) => def.agentPhase === phase
  );
}
