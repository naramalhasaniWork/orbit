/**
 * Knowledge Embedder — generates embeddings for knowledge chunks
 * and provides pgvector-based semantic search.
 */

import { prisma } from "@/lib/db";
import { createEmbeddings, createEmbedding } from "@/lib/ai/providers/openai";
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

  const texts = chunks.map((c) => c.content);
  const embeddings = await createEmbeddings(texts);

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

    // Then update embeddings via raw SQL (Prisma doesn't support vector type)
    const createdChunks = await tx.knowledgeChunk.findMany({
      where: { knowledgeFileId },
      orderBy: { chunkIndex: "asc" },
      select: { id: true, chunkIndex: true },
    });

    for (const record of createdChunks) {
      const embedding = embeddings[record.chunkIndex];
      if (!embedding) continue;

      const vectorStr = `[${embedding.join(",")}]`;
      await tx.$executeRawUnsafe(
        `UPDATE knowledge_chunks SET embedding = $1::vector WHERE id = $2::uuid`,
        vectorStr,
        record.id
      );
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
 * Search knowledge chunks by semantic similarity using pgvector.
 * Returns the most relevant chunks above the similarity threshold.
 */
export async function searchKnowledge(
  workspaceId: string,
  query: string,
  limit: number = 10
): Promise<SearchResult[]> {
  const queryEmbedding = await createEmbedding(query);
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  const results = await prisma.$queryRawUnsafe<
    Array<{
      content: string;
      metadata: Record<string, unknown>;
      type: string;
      name: string;
      similarity: number;
    }>
  >(
    `
    SELECT kc.content, kc.metadata, dkf.type, dkf.name,
      1 - (kc.embedding <=> $1::vector) as similarity
    FROM knowledge_chunks kc
    JOIN domain_knowledge_files dkf ON kc.knowledge_file_id = dkf.id
    WHERE kc.workspace_id = $2::uuid
      AND kc.embedding IS NOT NULL
    ORDER BY kc.embedding <=> $1::vector
    LIMIT $3
    `,
    vectorStr,
    workspaceId,
    limit
  );

  return results.map((r) => ({
    content: r.content,
    score: r.similarity,
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
