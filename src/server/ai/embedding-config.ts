// The embedding_config row records which provider/model/dimension produced the stored
// vectors. Writing vectors from a different configuration clears the old ones and
// rebuilds the HNSW index, so the next indexing run re-embeds everything consistently.

import { prisma } from "@/lib/db";
import { buildVectorIndexes, clearAllEmbeddings } from "@/lib/db/vector";
import { getEmbeddingProvider } from "@/server/ai/providers";

const ROW_ID = "default";
const CACHE_MS = 60_000;

let cached: { key: string; expiresAt: number } | null = null;

const keyOf = (provider: string, model: string, dimensions: number) => `${provider}:${model}:${dimensions}`;

async function storedKey(): Promise<string | null> {
  if (cached && cached.expiresAt > Date.now()) return cached.key;
  const row = await prisma.embeddingConfig.findUnique({ where: { id: ROW_ID } });
  const key = row ? keyOf(row.provider, row.model, row.dimensions) : null;
  if (key) cached = { key, expiresAt: Date.now() + CACHE_MS };
  return key;
}

/** Call before storing vectors. Resets stored vectors when the configuration changed. */
export async function ensureEmbeddingConfig(provider: string, model: string, dimensions: number): Promise<void> {
  const key = keyOf(provider, model, dimensions);
  const current = await storedKey();
  if (current === key) return;

  if (current) {
    console.warn(`[embeddings] Configuration changed (${current} -> ${key}); clearing stored vectors for re-embedding`);
    await clearAllEmbeddings();
  }
  await prisma.embeddingConfig.upsert({
    where: { id: ROW_ID },
    create: { id: ROW_ID, provider, model, dimensions },
    update: { provider, model, dimensions },
  });
  await buildVectorIndexes(dimensions, true);
  cached = { key, expiresAt: Date.now() + CACHE_MS };
}

/** Boot: make sure the HNSW index exists for the recorded dimension. */
export async function ensureVectorIndexForStoredConfig(): Promise<void> {
  const row = await prisma.embeddingConfig.findUnique({ where: { id: ROW_ID } });
  if (row) await buildVectorIndexes(row.dimensions, false);
}

/** True when stored vectors came from the configured provider and model. */
export async function vectorsAreCurrent(): Promise<boolean> {
  const provider = getEmbeddingProvider();
  if (!provider) return false;
  const current = await storedKey();
  return current !== null && current.startsWith(`${provider.name}:${provider.model}:`);
}

export function resetEmbeddingConfigCache(): void {
  cached = null;
}
