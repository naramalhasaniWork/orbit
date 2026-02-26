import { prisma } from "./index";

// ============================================================
// pgvector helpers for semantic search on system map nodes.
// Prisma doesn't support vector operations natively, so we
// use raw SQL via $queryRawUnsafe for embedding operations.
// ============================================================

const VECTOR_TABLES = [
  { table: "system_map_nodes", column: "embedding" },
  { table: "domain_knowledge_files", column: "embedding" },
  { table: "knowledge_chunks", column: "embedding" },
] as const;

/**
 * Get the current dimension of a vector column, or -1 if unknown.
 * pgvector stores dimension info in format_type output like "vector(384)".
 */
async function getColumnDimension(table: string, column: string): Promise<number> {
  try {
    const result = await prisma.$queryRawUnsafe<Array<{ col_type: string }>>(
      `SELECT format_type(a.atttypid, a.atttypmod) as col_type
       FROM pg_attribute a JOIN pg_class c ON a.attrelid = c.oid
       WHERE c.relname = $1 AND a.attname = $2 AND NOT a.attisdropped`,
      table,
      column
    );
    const colType = result[0]?.col_type ?? "";
    const match = colType.match(/vector\((\d+)\)/);
    return match ? parseInt(match[1], 10) : -1;
  } catch {
    return -1;
  }
}

/**
 * Resize a vector column to match the required dimension.
 * Clears existing embeddings since dimensions changed.
 */
async function resizeColumn(table: string, column: string, dim: number): Promise<void> {
  console.log(`[pgvector] Resizing ${table}.${column} to vector(${dim})`);
  await prisma.$executeRawUnsafe(
    `UPDATE ${table} SET ${column} = NULL WHERE ${column} IS NOT NULL`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE ${table} ALTER COLUMN ${column} TYPE vector(${dim})`
  );
  if (table === "system_map_nodes") {
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS system_map_nodes_embedding_hnsw_idx`);
    try {
      await prisma.$executeRawUnsafe(`
        CREATE INDEX system_map_nodes_embedding_hnsw_idx
        ON system_map_nodes USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
      `);
    } catch {
      console.warn("[pgvector] Could not recreate HNSW index after resize");
    }
  }
}

/**
 * Ensure the column dimension matches the embedding dimension.
 * Auto-resizes if there's a mismatch.
 */
export async function ensureDimension(table: string, column: string, dim: number): Promise<void> {
  const current = await getColumnDimension(table, column);
  if (current > 0 && current !== dim) {
    await resizeColumn(table, column, dim);
  }
}

/**
 * Ensures the pgvector extension and HNSW index exist.
 */
export async function ensureVectorSetup(): Promise<void> {
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);

  for (const { table, column } of VECTOR_TABLES) {
    try {
      const result = await prisma.$queryRawUnsafe<Array<{ data_type: string }>>(
        `SELECT data_type FROM information_schema.columns
         WHERE table_name = $1 AND column_name = $2`,
        table,
        column
      );

      if (result.length > 0 && result[0].data_type !== "USER-DEFINED") {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE ${table} DROP COLUMN IF EXISTS ${column}`
        );
        await prisma.$executeRawUnsafe(
          `ALTER TABLE ${table} ADD COLUMN ${column} vector`
        );
      }
    } catch {
      // Table might not exist yet
    }
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS system_map_nodes_embedding_hnsw_idx
      ON system_map_nodes
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
    `);
  } catch {
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
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE system_map_nodes SET embedding = $1::vector WHERE id = $2::uuid`,
      vectorStr,
      nodeId
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("dimensions")) {
      await ensureDimension("system_map_nodes", "embedding", embedding.length);
      await prisma.$executeRawUnsafe(
        `UPDATE system_map_nodes SET embedding = $1::vector WHERE id = $2::uuid`,
        vectorStr,
        nodeId
      );
    } else {
      throw err;
    }
  }
}

interface SimilarNode {
  id: string;
  name: string;
  type: string;
  file_path: string;
  similarity: number;
}

/**
 * Find the K most similar system map nodes to a query embedding.
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
 * Batch-update embeddings for multiple nodes.
 * Auto-detects dimension from the first embedding and resizes if needed.
 */
export async function batchSetEmbeddings(
  updates: Array<{ nodeId: string; embedding: number[] }>
): Promise<void> {
  if (updates.length === 0) return;

  const dim = updates[0].embedding.length;
  await ensureDimension("system_map_nodes", "embedding", dim);

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
