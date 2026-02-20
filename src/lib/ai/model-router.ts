import { MODELS } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/vault";
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

const DEFAULT_MODEL_MAP: Record<TaskType, string> = {
  framework_detection: MODELS.HAIKU,
  route_extraction: MODELS.HAIKU,
  system_map_generation: MODELS.HAIKU,
  test_generation: MODELS.SONNET,
  browser_execution: MODELS.SONNET,
  failure_analysis: MODELS.SONNET,
  report_writing: MODELS.HAIKU,
  security_testing: MODELS.OPUS,
  embedding: "text-embedding-3-small",
  visual_analysis: MODELS.SONNET,
  code_audit: MODELS.SONNET,
};

/** Fallback chain: if primary model is unavailable, try these in order */
const FALLBACK_CHAIN: Record<string, string[]> = {
  [MODELS.OPUS]: [MODELS.SONNET, MODELS.GPT4O],
  [MODELS.SONNET]: [MODELS.GPT4O, MODELS.HAIKU],
  [MODELS.HAIKU]: [MODELS.GPT4O_MINI],
  [MODELS.GPT4O]: [MODELS.SONNET, MODELS.GPT4O_MINI],
  [MODELS.GPT4O_MINI]: [MODELS.HAIKU],
};

/** Per-1K token costs (input, output, cached_input) */
const MODEL_COSTS: Record<string, { input: number; output: number; cached: number }> = {
  [MODELS.HAIKU]: { input: 0.0008, output: 0.004, cached: 0.00008 },
  [MODELS.SONNET]: { input: 0.003, output: 0.015, cached: 0.0003 },
  [MODELS.OPUS]: { input: 0.015, output: 0.075, cached: 0.0015 },
  [MODELS.GPT4O]: { input: 0.005, output: 0.015, cached: 0.0025 },
  [MODELS.GPT4O_MINI]: { input: 0.00015, output: 0.0006, cached: 0.000075 },
};

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
  return DEFAULT_MODEL_MAP[taskType];
}

/** Synchronous version for callers that can't await */
export function getModelForTaskSync(
  taskType: TaskType,
  workspaceOverrides?: WorkspaceModelOverrides
): string {
  const override = workspaceOverrides?.modelOverrides?.[taskType];
  if (override) return override;
  return DEFAULT_MODEL_MAP[taskType];
}

export function getFallbackModels(model: string): string[] {
  return FALLBACK_CHAIN[model] ?? [];
}

export async function getModelWithFallback(
  taskType: TaskType,
  workspaceId?: string,
  workspaceOverrides?: WorkspaceModelOverrides
): Promise<{ primary: string; fallbacks: string[] }> {
  const primary = await getModelForTask(taskType, workspaceId, workspaceOverrides);
  const strategy = workspaceOverrides?.fallbackStrategy ?? "auto";

  if (strategy === "none") {
    return { primary, fallbacks: [] };
  }

  return { primary, fallbacks: getFallbackModels(primary) };
}

export async function estimateTaskCost(
  taskType: TaskType,
  estimatedInputTokens: number,
  estimatedOutputTokens: number,
  cachedTokens = 0,
  workspaceId?: string,
  workspaceOverrides?: WorkspaceModelOverrides
): Promise<number> {
  const model = await getModelForTask(taskType, workspaceId, workspaceOverrides);
  const costs = MODEL_COSTS[model];
  if (!costs) return 0;

  const effectiveInput = estimatedInputTokens - cachedTokens;
  return (
    (effectiveInput / 1000) * costs.input +
    (estimatedOutputTokens / 1000) * costs.output +
    (cachedTokens / 1000) * costs.cached
  );
}

export function getModelCosts(model: string) {
  return MODEL_COSTS[model] ?? null;
}

export async function getAllTaskMappings(
  workspaceId?: string,
  workspaceOverrides?: WorkspaceModelOverrides
): Promise<Record<TaskType, string>> {
  const mappings = { ...DEFAULT_MODEL_MAP };

  // Apply DB configs
  if (workspaceId) {
    for (const [task, phase] of Object.entries(TASK_TO_PHASE)) {
      if (phase) {
        const config = await getAgentConfig(workspaceId, phase);
        if (config?.model) {
          mappings[task as TaskType] = config.model;
        }
      }
    }
  }

  // Apply legacy overrides (take precedence)
  if (workspaceOverrides?.modelOverrides) {
    for (const [task, model] of Object.entries(workspaceOverrides.modelOverrides)) {
      if (task in mappings && model) {
        mappings[task as TaskType] = model;
      }
    }
  }

  return mappings;
}

// ============================================================
// PROVIDER RESOLUTION
// ============================================================

const PROVIDER_PREFIXES: Record<string, string> = {
  claude: "anthropic",
  gpt: "openai",
};

/** Determine the provider for a model ID by prefix or ModelRegistry lookup */
export async function getProviderForModel(
  modelId: string
): Promise<string> {
  for (const [prefix, provider] of Object.entries(PROVIDER_PREFIXES)) {
    if (modelId.startsWith(prefix)) return provider;
  }

  // Check ModelRegistry for dynamic models
  const entry = await prisma.modelRegistry.findFirst({
    where: { modelId, isActive: true },
    select: { provider: true },
  });

  return entry?.provider ?? "openrouter";
}

// ============================================================
// WORKSPACE API KEY MANAGEMENT
// ============================================================

/** Fetch and decrypt a workspace-specific API key for a provider */
export async function getWorkspaceApiKey(
  workspaceId: string,
  provider: string
): Promise<string | null> {
  const config = await prisma.providerConfig.findUnique({
    where: {
      provider_config_unique: { workspaceId, provider },
    },
    select: { apiKeyEncrypted: true, isActive: true },
  });

  if (!config?.isActive || !config.apiKeyEncrypted) return null;

  // apiKeyEncrypted stores "iv:encrypted" format
  const [iv, encrypted] = config.apiKeyEncrypted.split(":");
  if (!encrypted || !iv) return null;

  try {
    return decrypt(encrypted, iv);
  } catch {
    console.error(
      `[ModelRouter] Failed to decrypt API key for workspace ${workspaceId}, provider ${provider}`
    );
    return null;
  }
}

// ============================================================
// AVAILABLE MODELS
// ============================================================

interface AvailableModel {
  modelId: string;
  displayName: string;
  provider: string;
  contextWindow: number;
  inputCostPer1M: number;
  outputCostPer1M: number;
}

/** Returns models from all configured providers, filtered by GlobalModelPolicy */
export async function getAvailableModels(
  workspaceId?: string
): Promise<AvailableModel[]> {
  // 1. Fetch workspace tier for policy filtering
  let workspaceTier = "free";
  if (workspaceId) {
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { tier: true },
    });
    if (ws) workspaceTier = ws.tier;
  }

  // 2. Built-in models
  const builtIn: AvailableModel[] = Object.entries(MODELS).map(
    ([key, modelId]) => {
      const costs = MODEL_COSTS[modelId];
      return {
        modelId,
        displayName: key,
        provider: modelId.startsWith("claude") ? "anthropic" : "openai",
        contextWindow: 0,
        inputCostPer1M: costs ? costs.input * 1000 : 0,
        outputCostPer1M: costs ? costs.output * 1000 : 0,
      };
    }
  );

  // 3. Dynamic models from ModelRegistry
  const registryModels = await prisma.modelRegistry.findMany({
    where: { isActive: true },
    select: {
      modelId: true,
      displayName: true,
      provider: true,
      contextWindow: true,
      inputCostPer1M: true,
      outputCostPer1M: true,
    },
  });

  const dynamic: AvailableModel[] = registryModels.map((m) => ({
    modelId: m.modelId,
    displayName: m.displayName,
    provider: m.provider,
    contextWindow: m.contextWindow,
    inputCostPer1M: m.inputCostPer1M,
    outputCostPer1M: m.outputCostPer1M,
  }));

  // 4. Merge (built-in first, then dynamic, deduped by modelId)
  const seen = new Set<string>();
  const merged: AvailableModel[] = [];

  for (const m of [...builtIn, ...dynamic]) {
    if (seen.has(m.modelId)) continue;
    seen.add(m.modelId);
    merged.push(m);
  }

  // 5. Filter by GlobalModelPolicy
  const policies = await prisma.globalModelPolicy.findMany({
    select: {
      modelId: true,
      provider: true,
      isAllowed: true,
      requiredTier: true,
    },
  });

  const policyMap = new Map(
    policies.map((p) => [`${p.provider}:${p.modelId}`, p])
  );

  const tierRanks: Record<string, number> = {
    free: 0,
    starter: 1,
    professional: 2,
    enterprise: 3,
  };
  const currentRank = tierRanks[workspaceTier] ?? 0;

  return merged.filter((m) => {
    const policy = policyMap.get(`${m.provider}:${m.modelId}`);
    if (!policy) return true; // No policy = allowed
    if (!policy.isAllowed) return false;
    if (policy.requiredTier) {
      const requiredRank = tierRanks[policy.requiredTier] ?? 0;
      if (currentRank < requiredRank) return false;
    }
    return true;
  });
}
