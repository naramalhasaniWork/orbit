import { prisma } from "./index";

// ============================================================
// pgvector + keyword search SQL. Prisma doesn't support vector or
// trigram operations natively, so these use raw SQL.
//
// Embedding columns are unconstrained `vector`, so any provider's
// dimension fits. Similarity search goes through a per-install HNSW
// expression index on embedding::vector(<dims>), built for the
// dimension recorded in embedding_config.
// ============================================================

const VECTOR_TABLES = [
  { table: "system_map_nodes", column: "embedding" },
  { table: "domain_knowledge_files", column: "embedding" },
  { table: "knowledge_chunks", column: "embedding" },
] as const;

const HNSW_INDEX = "system_map_nodes_embedding_hnsw_idx";
const CHUNKS_HNSW_INDEX = "knowledge_chunks_embedding_hnsw_idx";

function assertDims(dims: number): number {
  if (!Number.isInteger(dims) || dims <= 0 || dims > 16_000) {
    throw new Error(`Invalid embedding dimension: ${dims}`);
  }
  return dims;
}

const toVector = (embedding: number[]) => `[${embedding.join(",")}]`;

/**
 * Ensures the extensions and keyword-search indexes exist.
 * Never alters or drops columns: a non-vector embedding column is logged
 * and left untouched so no data is lost (fix it with a migration).
 */
export async function ensureVectorSetup(): Promise<void> {
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);

  for (const { table, column } of VECTOR_TABLES) {
    try {
      const result = await prisma.$queryRawUnsafe<Array<{ udt_name: string }>>(
        `SELECT udt_name FROM information_schema.columns
         WHERE table_name = $1 AND column_name = $2`,
        table,
        column
      );

      if (result.length > 0 && result[0].udt_name !== "vector") {
        console.error(
          `[pgvector] ${table}.${column} is type "${result[0].udt_name}", expected vector. ` +
            `Refusing to modify it automatically; apply a migration.`
        );
      }
    } catch (err) {
      console.error(`[pgvector] Could not inspect ${table}.${column}:`, err);
    }
  }

  // Keyword search (ORBIT_EMBEDDINGS=none, or vectors not built yet). Kept out of
  // migrations because Prisma cannot describe expression/opclass indexes.
  const keywordIndexes = [
    `CREATE INDEX IF NOT EXISTS system_map_nodes_name_trgm_idx ON system_map_nodes USING gin (name gin_trgm_ops)`,
    `CREATE INDEX IF NOT EXISTS knowledge_chunks_content_fts_idx ON knowledge_chunks USING gin (to_tsvector('english', content))`,
  ];
  for (const sql of keywordIndexes) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch {
      console.warn("[search] Could not create a keyword index (is pg_trgm installed?) — skipping");
    }
  }
}

/**
 * Build the HNSW expression indexes for one embedding dimension.
 * replace=true drops existing ones first (the dimension changed).
 */
export async function buildVectorIndexes(dims: number, replace: boolean): Promise<void> {
  const d = assertDims(dims);
  for (const [index, table] of [[HNSW_INDEX, "system_map_nodes"], [CHUNKS_HNSW_INDEX, "knowledge_chunks"]]) {
    if (replace) await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS ${index}`);
    try {
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS ${index} ON ${table}
         USING hnsw ((embedding::vector(${d})) vector_cosine_ops)
         WITH (m = 16, ef_construction = 64)
         WHERE vector_dims(embedding) = ${d}`
      );
    } catch {
      // pgvector's HNSW limit is 2000 dims; search still works, just without the index.
      console.warn(`[pgvector] Could not build ${index} for ${d} dimensions — searching without it`);
    }
  }
}

/** Drop every stored vector, so the next indexing run re-embeds with the new provider. */
export async function clearAllEmbeddings(): Promise<void> {
  for (const { table, column } of VECTOR_TABLES) {
    await prisma.$executeRawUnsafe(`UPDATE ${table} SET ${column} = NULL WHERE ${column} IS NOT NULL`);
  }
}

/**
 * Store an embedding for a system map node.
 */
export async function setNodeEmbedding(nodeId: string, embedding: number[]): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE system_map_nodes SET embedding = $1::vector WHERE id = $2::uuid`,
    toVector(embedding),
    nodeId
  );
}

/**
 * Batch-update embeddings for multiple nodes.
 */
export async function batchSetEmbeddings(
  updates: Array<{ nodeId: string; embedding: number[] }>
): Promise<void> {
  if (updates.length === 0) return;
  await prisma.$transaction(
    updates.map(({ nodeId, embedding }) =>
      prisma.$executeRawUnsafe(
        `UPDATE system_map_nodes SET embedding = $1::vector WHERE id = $2::uuid`,
        toVector(embedding),
        nodeId
      )
    )
  );
}

export interface SimilarNode {
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
  const d = assertDims(queryEmbedding.length);
  return prisma.$queryRawUnsafe<SimilarNode[]>(
    `
    SELECT id, name, type, file_path,
      1 - (embedding::vector(${d}) <=> $1::vector(${d})) AS similarity
    FROM system_map_nodes
    WHERE project_id = $2::uuid
      AND embedding IS NOT NULL
      AND vector_dims(embedding) = ${d}
    ORDER BY embedding::vector(${d}) <=> $1::vector(${d})
    LIMIT $3
    `,
    toVector(queryEmbedding),
    projectId,
    topK
  );
}

/** Trigram + full-text match on node names and paths; scores are 0-1. */
export async function keywordSearchNodes(
  projectId: string,
  query: string,
  topK: number = 10
): Promise<SimilarNode[]> {
  return prisma.$queryRawUnsafe<SimilarNode[]>(
    `
    SELECT id, name, type, file_path, similarity FROM (
      SELECT id, name, type, file_path,
        GREATEST(word_similarity(name, $1), word_similarity($1, name), similarity(file_path, $1)) AS similarity
      FROM system_map_nodes
      WHERE project_id = $2::uuid
    ) scored
    WHERE similarity > 0.2
    ORDER BY similarity DESC
    LIMIT $3
    `,
    query,
    projectId,
    topK
  );
}

export interface ChunkMatch {
  content: string;
  metadata: Record<string, unknown>;
  type: string;
  name: string;
  similarity: number;
}

export async function storeChunkEmbedding(
  db: Pick<typeof prisma, "$executeRawUnsafe">,
  chunkId: string,
  embedding: number[]
): Promise<void> {
  await db.$executeRawUnsafe(
    `UPDATE knowledge_chunks SET embedding = $1::vector WHERE id = $2::uuid`,
    toVector(embedding),
    chunkId
  );
}

export async function findSimilarChunks(
  workspaceId: string,
  queryEmbedding: number[],
  limit: number
): Promise<ChunkMatch[]> {
  const d = assertDims(queryEmbedding.length);
  return prisma.$queryRawUnsafe<ChunkMatch[]>(
    `
    SELECT kc.content, kc.metadata, dkf.type, dkf.name,
      1 - (kc.embedding::vector(${d}) <=> $1::vector(${d})) AS similarity
    FROM knowledge_chunks kc
    JOIN domain_knowledge_files dkf ON kc.knowledge_file_id = dkf.id
    WHERE kc.workspace_id = $2::uuid
      AND kc.embedding IS NOT NULL
      AND vector_dims(kc.embedding) = ${d}
    ORDER BY kc.embedding::vector(${d}) <=> $1::vector(${d})
    LIMIT $3
    `,
    toVector(queryEmbedding),
    workspaceId,
    limit
  );
}

/** Any-term full-text match; ts_rank normalisation 32 maps scores into 0-1. */
export async function keywordSearchChunks(
  workspaceId: string,
  tsQuery: string,
  limit: number
): Promise<ChunkMatch[]> {
  return prisma.$queryRawUnsafe<ChunkMatch[]>(
    `
    SELECT kc.content, kc.metadata, dkf.type, dkf.name,
      ts_rank(to_tsvector('english', kc.content), to_tsquery('english', $1), 32) AS similarity
    FROM knowledge_chunks kc
    JOIN domain_knowledge_files dkf ON kc.knowledge_file_id = dkf.id
    WHERE kc.workspace_id = $2::uuid
      AND to_tsvector('english', kc.content) @@ to_tsquery('english', $1)
    ORDER BY similarity DESC
    LIMIT $3
    `,
    tsQuery,
    workspaceId,
    limit
  );
}
