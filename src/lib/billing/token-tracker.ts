import { prisma } from "@/lib/db";
import { getModelCosts } from "@/lib/ai/model-router";

interface TokenTrackingParams {
  workspaceId: string;
  projectId?: string;
  runId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  agentPhase: "analyst" | "planner" | "executor" | "reporter";
}

/**
 * Calculate the cost for a given model and token counts.
 * Uses per-1K token pricing from model-router.
 */
export function calculateTokenCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens = 0
): number {
  const costs = getModelCosts(model);
  if (!costs) return 0;

  const effectiveInput = Math.max(0, inputTokens - cachedTokens);
  return (
    (effectiveInput / 1000) * costs.input +
    (outputTokens / 1000) * costs.output +
    (cachedTokens / 1000) * costs.cached
  );
}

/**
 * Record a single LLM API call's token usage.
 * Should be called after every AI provider call.
 */
export async function recordTokenUsage(params: TokenTrackingParams) {
  const {
    workspaceId,
    projectId,
    runId,
    model,
    inputTokens,
    outputTokens,
    cachedTokens = 0,
    agentPhase,
  } = params;

  const cost = calculateTokenCost(model, inputTokens, outputTokens, cachedTokens);

  await prisma.tokenUsage.create({
    data: {
      workspaceId,
      projectId: projectId ?? null,
      model,
      inputTokens,
      outputTokens,
      cachedTokens,
      cost: parseFloat(cost.toFixed(6)),
      agentPhase,
      runId: runId ?? null,
    },
  });

  return { cost, inputTokens, outputTokens, cachedTokens };
}

/**
 * Record token usage in batch (for bulk operations like embeddings).
 */
export async function recordTokenUsageBatch(
  records: TokenTrackingParams[]
) {
  const data = records.map((r) => {
    const cost = calculateTokenCost(r.model, r.inputTokens, r.outputTokens, r.cachedTokens);
    return {
      workspaceId: r.workspaceId,
      projectId: r.projectId ?? null,
      model: r.model,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      cachedTokens: r.cachedTokens ?? 0,
      cost: parseFloat(cost.toFixed(6)),
      agentPhase: r.agentPhase,
      runId: r.runId ?? null,
    };
  });

  await prisma.tokenUsage.createMany({ data });
}
