import { prisma } from "./index";

// ============================================================
// pgvector helpers for semantic search on system map nodes.
// Prisma doesn't support vector operations natively, so we
// use raw SQL via $queryRawUnsafe for embedding operations.
// ============================================================

/**
 * Ensures the pgvector extension and HNSW index exist.
 * Call once during migration or app startup.
 */
export async function ensureVectorSetup(): Promise<void> {
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS system_map_nodes_embedding_hnsw_idx
    ON system_map_nodes
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
  `);
}

/**
 * Store an embedding for a system map node.
 */
export async function setNodeEmbedding(
  nodeId: string,
  embedding: number[]
): Promise<void> {
  const vectorStr = `[${embedding.join(",")}]`;
  await prisma.$executeRawUnsafe(
    `UPDATE system_map_nodes SET embedding = $1::vector WHERE id = $2::uuid`,
    vectorStr,
    nodeId
  );
}

interface SimilarNode {
  id: string;
  name: string;
  type: string;
  file_path: string;
  similarity: number;
}

/**
 * Find the K most similar system map nodes to a query embedding
 * within a given project, using cosine distance via HNSW index.
 */
export async function findSimilarNodes(
  projectId: string,
  queryEmbedding: number[],
  topK: number = 10
): Promise<SimilarNode[]> {
  const vectorStr = `[${queryEmbedding.join(",")}]`;
  return prisma.$queryRawUnsafe<SimilarNode[]>(
    `
    SELECT
      id, name, type, file_path,
      1 - (embedding <=> $1::vector) AS similarity
    FROM system_map_nodes
    WHERE project_id = $2::uuid
      AND embedding IS NOT NULL
    ORDER BY embedding <=> $1::vector
    LIMIT $3
    `,
    vectorStr,
    projectId,
    topK
  );
}

/**
 * Batch-update embeddings for multiple nodes in a single transaction.
 */
export async function batchSetEmbeddings(
  updates: Array<{ nodeId: string; embedding: number[] }>
): Promise<void> {
  await prisma.$transaction(
    updates.map(({ nodeId, embedding }) => {
      const vectorStr = `[${embedding.join(",")}]`;
      return prisma.$executeRawUnsafe(
        `UPDATE system_map_nodes SET embedding = $1::vector WHERE id = $2::uuid`,
        vectorStr,
        nodeId
      );
    })
  );
}
