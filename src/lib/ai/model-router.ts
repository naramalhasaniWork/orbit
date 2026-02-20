import { MODELS } from "@/lib/ai";

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

interface WorkspaceModelOverrides {
  modelOverrides?: Partial<Record<TaskType, string>>;
  fallbackStrategy?: "auto" | "none";
}

export function getModelForTask(
  taskType: TaskType,
  workspaceOverrides?: WorkspaceModelOverrides
): string {
  const override = workspaceOverrides?.modelOverrides?.[taskType];
  if (override) {
    return override;
  }
  return DEFAULT_MODEL_MAP[taskType];
}

export function getFallbackModels(model: string): string[] {
  return FALLBACK_CHAIN[model] ?? [];
}

export function getModelWithFallback(
  taskType: TaskType,
  workspaceOverrides?: WorkspaceModelOverrides
): { primary: string; fallbacks: string[] } {
  const primary = getModelForTask(taskType, workspaceOverrides);
  const strategy = workspaceOverrides?.fallbackStrategy ?? "auto";

  if (strategy === "none") {
    return { primary, fallbacks: [] };
  }

  return { primary, fallbacks: getFallbackModels(primary) };
}

export function estimateTaskCost(
  taskType: TaskType,
  estimatedInputTokens: number,
  estimatedOutputTokens: number,
  cachedTokens = 0,
  workspaceOverrides?: WorkspaceModelOverrides
): number {
  const model = getModelForTask(taskType, workspaceOverrides);
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

export function getAllTaskMappings(
  workspaceOverrides?: WorkspaceModelOverrides
): Record<TaskType, string> {
  const mappings = { ...DEFAULT_MODEL_MAP };

  if (workspaceOverrides?.modelOverrides) {
    for (const [task, model] of Object.entries(
      workspaceOverrides.modelOverrides
    )) {
      if (task in mappings && model) {
        mappings[task as TaskType] = model;
      }
    }
  }

  return mappings;
}
