// USD pricing for a model: the built-in catalog first, then ModelRegistry rows
// (OpenRouter-synced or admin-added), cached per process.

import { prisma } from "@/lib/db";
import { CACHE_WRITE_MULTIPLIER, getModelSpec, type ModelCosts } from "@/server/ai/model-catalog";
import type { Usage } from "@/server/ai/types";

const REGISTRY_TTL_MS = 60 * 60 * 1000;
const registryCache = new Map<string, { costs: ModelCosts | null; expiresAt: number }>();

async function registryCosts(model: string): Promise<ModelCosts | null> {
  const cached = registryCache.get(model);
  if (cached && cached.expiresAt > Date.now()) return cached.costs;

  let costs: ModelCosts | null = null;
  try {
    const entry = await prisma.modelRegistry.findFirst({
      where: { modelId: model, isActive: true },
      select: { inputCostPer1M: true, outputCostPer1M: true },
    });
    if (entry) {
      // Registry rows carry no cache price: bill cache hits at the full input rate.
      const input = entry.inputCostPer1M / 1000;
      costs = { input, output: entry.outputCostPer1M / 1000, cacheRead: input };
    }
  } catch {
    // Pricing lookup must never block a call or usage recording
  }
  registryCache.set(model, { costs, expiresAt: Date.now() + REGISTRY_TTL_MS });
  return costs;
}

/** Per-1K prices for a model, or null when it is unpriced (billed as $0). */
export async function getCosts(model: string): Promise<ModelCosts | null> {
  return getModelSpec(model)?.costs ?? (await registryCosts(model));
}

/** inputTokens is the full prompt, including cache reads and writes. */
export function costOf(costs: ModelCosts | null, usage: Usage): number {
  if (!costs) return 0;
  const uncached = Math.max(0, usage.inputTokens - usage.cacheReadTokens - usage.cacheCreationTokens);
  return (
    (uncached / 1000) * costs.input +
    (usage.cacheCreationTokens / 1000) * costs.input * CACHE_WRITE_MULTIPLIER +
    (usage.cacheReadTokens / 1000) * costs.cacheRead +
    (usage.outputTokens / 1000) * costs.output
  );
}

export async function calculateCost(model: string, usage: Usage): Promise<number> {
  return costOf(await getCosts(model), usage);
}
