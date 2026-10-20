// OpenRouter model discovery: keeps the ModelRegistry table in sync with the catalog
// OpenRouter serves, so its models are selectable and priced.

import { prisma } from "@/lib/db";

interface OpenRouterModel {
  modelId: string;
  displayName: string;
  contextWindow: number;
  inputCostPer1M: number;
  outputCostPer1M: number;
  capabilities: Record<string, boolean>;
}

const API_BASE = "https://openrouter.ai/api/v1";

function getApiKey(providedKey?: string): string {
  const key = providedKey ?? process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      "OpenRouter API key not provided and OPENROUTER_API_KEY environment variable is not set"
    );
  }
  return key;
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://useorbit.dev",
    "X-Title": "Orbit Testing Platform",
  };
}

export async function discoverOpenRouterModels(
  apiKey?: string
): Promise<OpenRouterModel[]> {
  const key = getApiKey(apiKey);

  const response = await fetch(`${API_BASE}/models`, {
    headers: buildHeaders(key),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `OpenRouter models API error (${response.status}): ${errorBody}`
    );
  }

  const data = await response.json();
  const models: OpenRouterModel[] = [];

  for (const m of data.data ?? []) {
    models.push({
      modelId: m.id ?? "",
      displayName: m.name ?? m.id ?? "",
      contextWindow: m.context_length ?? 0,
      inputCostPer1M: parseFloat(m.pricing?.prompt ?? "0") * 1_000_000,
      outputCostPer1M: parseFloat(m.pricing?.completion ?? "0") * 1_000_000,
      capabilities: {
        chat: true,
        streaming: true,
        functionCalling: Boolean(m.supported_parameters?.includes("tools")),
        vision: Boolean(m.architecture?.modality?.includes("image")),
      },
    });
  }

  return models;
}

const SYNC_BATCH_SIZE = 25;
const SYNC_STALE_MS = 24 * 60 * 60 * 1000;

export async function syncModelsToRegistry(
  apiKey?: string
): Promise<number> {
  const models = await discoverOpenRouterModels(apiKey);
  const syncedAt = new Date();
  let upsertCount = 0;

  for (let i = 0; i < models.length; i += SYNC_BATCH_SIZE) {
    const batch = models.slice(i, i + SYNC_BATCH_SIZE);
    await Promise.all(
      batch.map((m) =>
        prisma.modelRegistry.upsert({
          where: {
            model_registry_unique: {
              provider: "openrouter",
              modelId: m.modelId,
            },
          },
          create: {
            provider: "openrouter",
            modelId: m.modelId,
            displayName: m.displayName,
            contextWindow: m.contextWindow,
            inputCostPer1M: m.inputCostPer1M,
            outputCostPer1M: m.outputCostPer1M,
            capabilities: m.capabilities,
            isActive: true,
            lastSyncedAt: syncedAt,
          },
          update: {
            displayName: m.displayName,
            contextWindow: m.contextWindow,
            inputCostPer1M: m.inputCostPer1M,
            outputCostPer1M: m.outputCostPer1M,
            capabilities: m.capabilities,
            lastSyncedAt: syncedAt,
          },
        })
      )
    );
    upsertCount += batch.length;
  }

  return upsertCount;
}

/**
 * Sync OpenRouter models into the registry if it's empty or stale (>24h).
 * Safe to call opportunistically — no-ops when fresh, never throws.
 */
export async function ensureModelRegistryFresh(apiKey?: string): Promise<void> {
  try {
    const key = apiKey ?? process.env.OPENROUTER_API_KEY;
    if (!key) return;

    const newest = await prisma.modelRegistry.findFirst({
      where: { provider: "openrouter" },
      orderBy: { lastSyncedAt: "desc" },
      select: { lastSyncedAt: true },
    });

    const isStale =
      !newest?.lastSyncedAt ||
      Date.now() - newest.lastSyncedAt.getTime() > SYNC_STALE_MS;

    if (!isStale) return;

    const count = await syncModelsToRegistry(key);
    console.log(`[OpenRouter] Synced ${count} models to registry`);
  } catch (err) {
    console.error(
      "[OpenRouter] Model registry sync failed:",
      err instanceof Error ? err.message : err
    );
  }
}
