/**
 * Knowledge Embedder — stores knowledge chunks (with embeddings when a provider is
 * configured) and searches them through search.knowledge.
 */

import { prisma } from "@/lib/db";
import { storeChunkEmbedding } from "@/lib/db/vector";
import { embed } from "@/server/ai/gateway";
import { ensureEmbeddingConfig } from "@/server/ai/embedding-config";
import { search } from "@/server/ai/search";
import type { Chunk } from "./chunker";
import type { Prisma } from "@/generated/prisma/client";

interface SearchResult {
  content: string;
  score: number;
  fileType: string;
  fileName: string;
  section?: string;
}

/**
 * Generate embeddings for an array of chunks and store them in the database.
 * Returns the embedding vectors for optional further use.
 */
export async function embedChunks(
  chunks: Chunk[],
  knowledgeFileId: string,
  workspaceId: string
): Promise<number[][]> {
  if (chunks.length === 0) return [];

  // Keyword-only mode (ORBIT_EMBEDDINGS=none) stores chunks without vectors.
  const result = await embed(chunks.map((c) => c.content), workspaceId);
  const embeddings = result?.vectors ?? [];
  if (result && embeddings[0]) {
    await ensureEmbeddingConfig(result.provider, result.model, embeddings[0].length);
  }

  // Store chunks with embeddings in a transaction
  await prisma.$transaction(async (tx) => {
    // First create all chunk records without embeddings
    for (const chunk of chunks) {
      await tx.knowledgeChunk.create({
        data: {
          knowledgeFileId,
          workspaceId,
          content: chunk.content,
          chunkIndex: chunk.index,
          metadata: JSON.parse(JSON.stringify(chunk.metadata)) as Prisma.InputJsonValue,
        },
      });
    }

    const createdChunks = await tx.knowledgeChunk.findMany({
      where: { knowledgeFileId },
      orderBy: { chunkIndex: "asc" },
      select: { id: true, chunkIndex: true },
    });

    for (const record of createdChunks) {
      const embedding = embeddings[record.chunkIndex];
      if (!embedding) continue;

      await storeChunkEmbedding(tx, record.id, embedding);
    }

    // Update the parent file's chunk count
    await tx.domainKnowledgeFile.update({
      where: { id: knowledgeFileId },
      data: { chunkCount: chunks.length },
    });
  });

  return embeddings;
}

/**
 * Search knowledge chunks: vector similarity when available, keyword match otherwise.
 */
export async function searchKnowledge(
  workspaceId: string,
  query: string,
  limit: number = 10
): Promise<SearchResult[]> {
  const results = await search.knowledge(workspaceId, query, limit);
  return results.map((r) => ({
    content: r.content,
    score: Number(r.similarity),
    fileType: r.type,
    fileName: r.name,
    section: r.metadata?.section as string | undefined,
  }));
}

/**
 * Delete all chunks for a knowledge file.
 * The cascade on the FK handles this automatically, but this
 * provides an explicit entry point.
 */
export async function deleteChunksForFile(
  knowledgeFileId: string
): Promise<void> {
  await prisma.knowledgeChunk.deleteMany({
    where: { knowledgeFileId },
  });
}
