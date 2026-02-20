import { MODELS } from "@/lib/ai";

export const TASK_TYPES = {
  framework_detection: "framework_detection",
  route_extraction: "route_extraction",
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
  test_generation: MODELS.SONNET,
  browser_execution: MODELS.SONNET,
  failure_analysis: MODELS.SONNET,
  report_writing: MODELS.HAIKU,
  security_testing: MODELS.OPUS,
  embedding: "text-embedding-3-small",
};

interface WorkspaceModelOverrides {
  modelOverrides?: Partial<Record<TaskType, string>>;
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
