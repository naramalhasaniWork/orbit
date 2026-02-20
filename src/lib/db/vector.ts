import { prisma } from "./index";

// ============================================================
// pgvector helpers for semantic search on system map nodes.
// Prisma doesn't support vector operations natively, so we
// use raw SQL via $queryRawUnsafe for embedding operations.
// ============================================================

/**
 * Ensures the pgvector extension and HNSW index exist.
 * Call once during migration or app startup.
 *
 * Prisma's driver adapter stores Unsupported("vector(1536)") columns
 * as jsonb. We need to ALTER them to the proper vector type before
 * creating HNSW indexes.
 */
export async function ensureVectorSetup(): Promise<void> {
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);

  // Fix columns that Prisma created as jsonb instead of vector
  const vectorColumns = [
    { table: "system_map_nodes", column: "embedding" },
    { table: "domain_knowledge_files", column: "embedding" },
    { table: "knowledge_chunks", column: "embedding" },
  ];

  for (const { table, column } of vectorColumns) {
    try {
      // Check if column exists and is jsonb, then convert to vector
      const result = await prisma.$queryRawUnsafe<Array<{ data_type: string }>>(
        `SELECT data_type FROM information_schema.columns
         WHERE table_name = $1 AND column_name = $2`,
        table,
        column
      );

      if (result.length > 0 && result[0].data_type !== "USER-DEFINED") {
        // Column exists but is not vector type — drop and re-add
        await prisma.$executeRawUnsafe(
          `ALTER TABLE ${table} DROP COLUMN IF EXISTS ${column}`
        );
        await prisma.$executeRawUnsafe(
          `ALTER TABLE ${table} ADD COLUMN ${column} vector(1536)`
        );
      }
    } catch {
      // Table might not exist yet — skip
    }
  }

  // Create HNSW index on system_map_nodes
  try {
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS system_map_nodes_embedding_hnsw_idx
      ON system_map_nodes
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
    `);
  } catch {
    // Index may already exist or column type may still not be vector
    console.warn("[pgvector] Could not create HNSW index — skipping");
  }
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
