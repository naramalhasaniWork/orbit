// Retrieval behind one door. Vector search when an embedding provider is configured and
// the stored vectors match it; otherwise (ORBIT_EMBEDDINGS=none, provider down, vectors
// stale or not built yet) keyword search over the same rows. Callers never see the difference.

import {
  findSimilarChunks,
  findSimilarNodes,
  keywordSearchChunks,
  keywordSearchNodes,
  type ChunkMatch,
  type SimilarNode,
} from "@/lib/db/vector";
import { embed } from "@/server/ai/gateway";
import { vectorsAreCurrent } from "@/server/ai/embedding-config";

export type { SimilarNode, ChunkMatch };

const MAX_TERMS = 32;

/** "login form, auth!" -> "login | form | auth" (any-term match for to_tsquery). */
export function toAnyTermQuery(text: string): string | null {
  const terms = Array.from(new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])).slice(0, MAX_TERMS);
  return terms.length > 0 ? terms.join(" | ") : null;
}

async function queryVector(query: string, workspaceId?: string): Promise<number[] | null> {
  try {
    if (!(await vectorsAreCurrent())) return null;
    const result = await embed([query], workspaceId);
    return result?.vectors[0] ?? null;
  } catch (err) {
    console.warn("[search] Embedding unavailable, using keyword search:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** System map nodes most related to the query, best first. */
async function nodes(projectId: string, query: string, topK = 10): Promise<SimilarNode[]> {
  const vector = await queryVector(query);
  if (vector) {
    const hits = await findSimilarNodes(projectId, vector, topK);
    if (hits.length > 0) return hits.map((h) => ({ ...h, similarity: Number(h.similarity) }));
  }
  const hits = await keywordSearchNodes(projectId, query, topK);
  return hits.map((h) => ({ ...h, similarity: Number(h.similarity) }));
}

/** Domain-knowledge chunks most related to the query, best first. */
async function knowledge(workspaceId: string, query: string, limit = 10): Promise<ChunkMatch[]> {
  const vector = await queryVector(query, workspaceId);
  if (vector) {
    const hits = await findSimilarChunks(workspaceId, vector, limit);
    if (hits.length > 0) return hits;
  }
  const tsQuery = toAnyTermQuery(query);
  return tsQuery ? keywordSearchChunks(workspaceId, tsQuery, limit) : [];
}

export const search = { semantic: nodes, knowledge };
