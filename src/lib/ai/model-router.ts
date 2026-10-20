import { prisma } from "@/lib/db";
import { getModelSpec, modelForTier, type ModelTier, type Provider } from "@/server/ai/model-catalog";
import { getWorkspaceCredential } from "@/server/ai/providers";
import { getEmbeddingProvider } from "@/server/ai/providers/embeddings";
import type { AgentPhase } from "@/generated/prisma/client";

export const TASK_TYPES = {
  framework_detection: "framework_detection",
  route_extraction: "route_extraction",
  system_map_generation: "system_map_generation",
  test_generation: "test_generation",
  browser_execution: "browser_execution",
  failure_analysis: "failure_analysis",
  report_writing: "report_writing",
  security_testing: "security_testing",
  embedding: "embedding",
  visual_analysis: "visual_analysis",
  code_audit: "code_audit",
} as const;

export type TaskType = keyof typeof TASK_TYPES;

// Defaults come from model tiers (ORBIT_MODEL_FAST / _BALANCED / _DEEP, see
// server/ai/model-catalog); workspaces override per agent phase via AgentConfig.
const DEFAULT_TIER: Record<Exclude<TaskType, "embedding" | "browser_execution">, ModelTier> = {
  framework_detection: "fast",
  route_extraction: "fast",
  system_map_generation: "fast",
  test_generation: "balanced",
  failure_analysis: "balanced",
  report_writing: "fast",
  security_testing: "deep",
  visual_analysis: "balanced",
  code_audit: "balanced",
};

/**
 * The browser agent starts on the fast tier and escalates to the balanced tier on repeated
 * divergence or parse failures (see services/execution/executor-decision).
 * ORBIT_AGENT_MODEL pins one model and disables escalation.
 */
export function getAgentModels(env: Record<string, string | undefined> = process.env): { primary: string; escalation: string | null } {
  const pinned = env.ORBIT_AGENT_MODEL?.trim();
  if (pinned) return { primary: pinned, escalation: null };
  return { primary: modelForTier("fast", env), escalation: modelForTier("balanced", env) };
}

function defaultModelFor(taskType: TaskType): string {
  if (taskType === "embedding") return getEmbeddingProvider()?.model ?? "none";
  if (taskType === "browser_execution") return getAgentModels().primary;
  return modelForTier(DEFAULT_TIER[taskType]);
}

const DEFAULT_MAX_OUTPUT_TOKENS = 8_192;

/**
 * Returns the effective max output tokens for a model.
 * Priority: workspace AgentConfig.maxOutputTokens → model ceiling → safe default.
 */
export function getMaxOutputTokensForModel(
  model: string,
  agentConfigOverride?: number | null
): number {
  if (agentConfigOverride && agentConfigOverride > 0) return agentConfigOverride;
  return getModelSpec(model)?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
}

/**
 * Derive a safe test-case cap from an output-token budget.
 *
 * Empirical sizing (measured from actual LLM output):
 *   ~400 tokens per test case (id, name, type, journey, priorityScore, criticality,
 *    risk, coverageGap, 3-5 steps with action/expected/selectorHint, rationale,
 *    2-3 edgeCases strings)
 *   ~800 tokens for the outer envelope (projectId, version, generatedAt, metadata)
 *   0.75 efficiency factor — leave 25% headroom so the model doesn't hit the ceiling
 *    mid-response, which causes parse failures even with truncation recovery
 *
 * Minimum 10 to avoid trivially small plans.
 */
export function computeMaxTestCasesForTokenBudget(maxTokens: number): number {
  const TOKENS_PER_TEST_CASE = 400;
  const OVERHEAD = 800;
  const EFFICIENCY = 0.75;
  return Math.max(10, Math.floor((maxTokens * EFFICIENCY - OVERHEAD) / TOKENS_PER_TEST_CASE));
}

// ============================================================
// TASK → AGENT PHASE MAPPING
// ============================================================

const TASK_TO_PHASE: Partial<Record<TaskType, AgentPhase>> = {
  framework_detection: "analyst",
  route_extraction: "analyst",
  system_map_generation: "analyst",
  test_generation: "planner",
  browser_execution: "executor",
  failure_analysis: "reporter",
  report_writing: "reporter",
  security_testing: "executor",
  visual_analysis: "executor",
  code_audit: "analyst",
};

export function taskToAgentPhase(taskType: TaskType): AgentPhase | null {
  return TASK_TO_PHASE[taskType] ?? null;
}

// ============================================================
// CACHED AGENT CONFIG GETTER (60s TTL)
// ============================================================

interface CachedAgentConfig {
  model: string | null;
  temperature: number | null;
  maxInputTokens: number | null;
  maxOutputTokens: number | null;
  customPrompt: string | null;
  isEnabled: boolean;
}

interface CacheEntry {
  config: CachedAgentConfig | null;
  expiresAt: number;
}

const CONFIG_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function cacheKey(workspaceId: string, phase: AgentPhase): string {
  return `${workspaceId}:${phase}`;
}

export async function getAgentConfig(
  workspaceId: string,
  phase: AgentPhase
): Promise<CachedAgentConfig | null> {
  const key = cacheKey(workspaceId, phase);
  const cached = CONFIG_CACHE.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.config;
  }

  const row = await prisma.agentConfig.findUnique({
    where: { agent_config_unique: { workspaceId, agentPhase: phase } },
    select: {
      model: true,
      temperature: true,
      maxInputTokens: true,
      maxOutputTokens: true,
      customPrompt: true,
      isEnabled: true,
    },
  });

  const config: CachedAgentConfig | null = row
    ? {
        model: row.model,
        temperature: row.temperature,
        maxInputTokens: row.maxInputTokens,
        maxOutputTokens: row.maxOutputTokens,
        customPrompt: row.customPrompt,
        isEnabled: row.isEnabled,
      }
    : null;

  CONFIG_CACHE.set(key, { config, expiresAt: Date.now() + CACHE_TTL_MS });
  return config;
}

/** Invalidate cache for a workspace + phase (call after config update) */
export function invalidateAgentConfigCache(workspaceId: string, phase?: AgentPhase): void {
  if (phase) {
    CONFIG_CACHE.delete(cacheKey(workspaceId, phase));
  } else {
    for (const k of Array.from(CONFIG_CACHE.keys())) {
      if (k.startsWith(`${workspaceId}:`)) {
        CONFIG_CACHE.delete(k);
      }
    }
  }
}

// ============================================================
// MODEL RESOLUTION (now with DB-backed overrides)
// ============================================================

interface WorkspaceModelOverrides {
  modelOverrides?: Partial<Record<TaskType, string>>;
  fallbackStrategy?: "auto" | "none";
}

export async function getModelForTask(
  taskType: TaskType,
  workspaceId?: string,
  workspaceOverrides?: WorkspaceModelOverrides
): Promise<string> {
  // 1. Check DB agent config
  if (workspaceId) {
    const phase = taskToAgentPhase(taskType);
    if (phase) {
      const config = await getAgentConfig(workspaceId, phase);
      if (config?.model) return config.model;
    }
  }

  // 2. Check legacy in-memory overrides
  const override = workspaceOverrides?.modelOverrides?.[taskType];
  if (override) return override;

  // 3. Return default
  return defaultModelFor(taskType);
}

/** Built-in per-1K pricing (input, output, cached input), or null for unknown models. */
export function getModelCosts(model: string): { input: number; output: number; cached: number } | null {
  const spec = getModelSpec(model);
  return spec ? { input: spec.costs.input, output: spec.costs.output, cached: spec.costs.cacheRead } : null;
}

/** Decrypted workspace (BYOK) key for a provider, or null. */
export async function getWorkspaceApiKey(workspaceId: string, provider: Provider): Promise<string | null> {
  return (await getWorkspaceCredential(workspaceId, provider))?.apiKey ?? null;
}
