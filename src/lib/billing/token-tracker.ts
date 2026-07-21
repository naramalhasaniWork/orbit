import { prisma } from "@/lib/db";
import { getModelCosts } from "@/lib/ai/model-router";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface TokenTrackingParams {
  workspaceId: string;
  projectId?: string;
  runId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  agentPhase: "analyst" | "planner" | "executor" | "reporter" | "auditor";
}

interface PerThousandCosts {
  input: number;
  output: number;
  cached: number;
}

// Registry pricing cache — dynamic (OpenRouter) models aren't in the
// built-in cost table, so we look them up once and cache per process.
const REGISTRY_COST_CACHE = new Map<string, PerThousandCosts | null>();
const REGISTRY_COST_TTL_MS = 60 * 60 * 1000;
const registryCostExpiry = new Map<string, number>();

async function getRegistryCosts(model: string): Promise<PerThousandCosts | null> {
  const expiry = registryCostExpiry.get(model);
  if (expiry && expiry > Date.now() && REGISTRY_COST_CACHE.has(model)) {
    return REGISTRY_COST_CACHE.get(model) ?? null;
  }

  let costs: PerThousandCosts | null = null;
  try {
    const entry = await prisma.modelRegistry.findFirst({
      where: { modelId: model, isActive: true },
      select: { inputCostPer1M: true, outputCostPer1M: true },
    });
    if (entry) {
      costs = {
        input: entry.inputCostPer1M / 1000,
        output: entry.outputCostPer1M / 1000,
        cached: entry.inputCostPer1M / 1000,
      };
    }
  } catch {
    // Pricing lookup must never block usage recording
  }

  REGISTRY_COST_CACHE.set(model, costs);
  registryCostExpiry.set(model, Date.now() + REGISTRY_COST_TTL_MS);
  return costs;
}

function applyCosts(
  costs: PerThousandCosts,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number
): number {
  const effectiveInput = Math.max(0, inputTokens - cachedTokens);
  return (
    (effectiveInput / 1000) * costs.input +
    (outputTokens / 1000) * costs.output +
    (cachedTokens / 1000) * costs.cached
  );
}

/**
 * Calculate the cost for a given model and token counts.
 * Uses per-1K token pricing from model-router (built-in models only).
 */
export function calculateTokenCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens = 0
): number {
  const costs = getModelCosts(model);
  if (!costs) return 0;
  return applyCosts(costs, inputTokens, outputTokens, cachedTokens);
}

/**
 * Async variant that falls back to ModelRegistry pricing for dynamic
 * (e.g. OpenRouter) models when the built-in table has no entry.
 */
export async function calculateTokenCostAsync(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens = 0
): Promise<number> {
  const builtIn = getModelCosts(model);
  if (builtIn) return applyCosts(builtIn, inputTokens, outputTokens, cachedTokens);

  const registry = await getRegistryCosts(model);
  if (registry) return applyCosts(registry, inputTokens, outputTokens, cachedTokens);

  return 0;
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

  const cost = await calculateTokenCostAsync(model, inputTokens, outputTokens, cachedTokens);

  if (!UUID_RE.test(workspaceId)) {
    return { cost, inputTokens, outputTokens, cachedTokens };
  }

  // Sanitize IDs — Prisma expects valid UUIDs; sub-agent parent IDs may have
  // timestamp suffixes appended (e.g. "plan-<uuid>-<ts>") which are not valid UUIDs.
  const safeRunId = runId && UUID_RE.test(runId) ? runId : null;
  const safeProjectId = projectId && UUID_RE.test(projectId) ? projectId : (projectId ?? null);

  await prisma.tokenUsage.create({
    data: {
      workspaceId,
      projectId: safeProjectId,
      model,
      inputTokens,
      outputTokens,
      cachedTokens,
      cost: parseFloat(cost.toFixed(6)),
      agentPhase,
      runId: safeRunId,
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
  const data = await Promise.all(
    records
    .filter((r) => UUID_RE.test(r.workspaceId))
    .map(async (r) => {
      const cost = await calculateTokenCostAsync(r.model, r.inputTokens, r.outputTokens, r.cachedTokens);
      return {
        workspaceId: r.workspaceId,
        projectId: r.projectId && UUID_RE.test(r.projectId) ? r.projectId : (r.projectId ?? null),
        model: r.model,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        cachedTokens: r.cachedTokens ?? 0,
        cost: parseFloat(cost.toFixed(6)),
        agentPhase: r.agentPhase,
        runId: r.runId && UUID_RE.test(r.runId) ? r.runId : null,
      };
    })
  );

  if (data.length === 0) return;
  await prisma.tokenUsage.createMany({ data });
}
