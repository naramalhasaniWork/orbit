import { prisma } from "@/lib/db";
import { createEmbedding } from "@/lib/ai";

interface RetrievedNode {
  id: string;
  type: string;
  name: string;
  filePath: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

/**
 * Semantic retrieval using cosine similarity.
 * Tries native pgvector first (embedding_vec column with <=> operator),
 * falls back to JSONB-based cosine similarity computation.
 */
export async function retrieveRelevantNodes(
  projectId: string,
  query: string,
  topK = 10
): Promise<RetrievedNode[]> {
  const queryEmbedding = await createEmbedding(query);

  // Try pgvector native search first
  const pgvectorResults = await tryPgvectorSearch(projectId, queryEmbedding, topK);
  if (pgvectorResults) return pgvectorResults;

  // Fallback to JSONB cosine similarity
  return jsonbCosineSimilaritySearch(projectId, queryEmbedding, topK);
}

async function tryPgvectorSearch(
  projectId: string,
  queryEmbedding: number[],
  topK: number
): Promise<RetrievedNode[] | null> {
  try {
    const vectorStr = `[${queryEmbedding.join(",")}]`;
    const results = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        type: string;
        name: string;
        file_path: string;
        metadata: Record<string, unknown>;
        similarity: number;
      }>
    >(
      `SELECT
        id, type, name, file_path, metadata,
        1 - (embedding_vec <=> $1::vector) AS similarity
      FROM system_map_nodes
      WHERE project_id = $2::uuid
        AND embedding_vec IS NOT NULL
      ORDER BY embedding_vec <=> $1::vector
      LIMIT $3`,
      vectorStr,
      projectId,
      topK
    );

    return results.map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      filePath: r.file_path,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      similarity: Number(r.similarity),
    }));
  } catch {
    // pgvector column not available — fall back to JSONB
    return null;
  }
}

async function jsonbCosineSimilaritySearch(
  projectId: string,
  queryEmbedding: number[],
  topK: number
): Promise<RetrievedNode[]> {
  const queryVector = JSON.stringify(queryEmbedding);

  const results = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      type: string;
      name: string;
      file_path: string;
      metadata: Record<string, unknown>;
      similarity: number;
    }>
  >(
    `
    WITH query_vec AS (
      SELECT $1::jsonb AS vec
    ),
    node_scores AS (
      SELECT
        n.id,
        n.type,
        n.name,
        n.file_path,
        n.metadata,
        (
          SELECT COALESCE(
            SUM(
              (ne.val::float8) * (qe.val::float8)
            ) / NULLIF(
              SQRT(SUM(POWER(ne.val::float8, 2))) *
              SQRT(SUM(POWER(qe.val::float8, 2))),
              0
            ),
            0
          )
          FROM jsonb_array_elements_text(n.embedding) WITH ORDINALITY AS ne(val, ord)
          JOIN jsonb_array_elements_text(query_vec.vec) WITH ORDINALITY AS qe(val, ord)
            ON ne.ord = qe.ord
        ) AS similarity
      FROM system_map_nodes n, query_vec
      WHERE n.project_id = $2::uuid
        AND n.embedding IS NOT NULL
        AND jsonb_array_length(n.embedding) > 0
    )
    SELECT id, type, name, file_path, metadata, similarity
    FROM node_scores
    ORDER BY similarity DESC
    LIMIT $3
    `,
    queryVector,
    projectId,
    topK
  );

  return results.map((r) => ({
    id: r.id,
    type: r.type,
    name: r.name,
    filePath: r.file_path,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    similarity: Number(r.similarity),
  }));
}

export async function getProjectContext(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      environments: { where: { isDefault: true }, take: 1 },
      workspace: { select: { settings: true } },
    },
  });

  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  const nodeCount = await prisma.systemMapNode.count({ where: { projectId } });
  const edgeCount = await prisma.systemMapEdge.count({ where: { projectId } });

  const activePlan = await prisma.testPlan.findFirst({
    where: { projectId, isActive: true },
    orderBy: { version: "desc" },
    include: { _count: { select: { testCases: true } } },
  });

  const lastRun = await prisma.testRun.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  // Extract custom prompt from workspace settings
  const workspaceSettings = (project.workspace?.settings ?? {}) as Record<string, unknown>;
  const customPrompt = typeof workspaceSettings.customPrompt === "string"
    ? workspaceSettings.customPrompt
    : undefined;

  return {
    project,
    defaultEnvironment: project.environments[0] ?? null,
    systemMapStats: { nodes: nodeCount, edges: edgeCount },
    activePlan: activePlan
      ? { id: activePlan.id, version: activePlan.version, testCaseCount: activePlan._count.testCases }
      : null,
    lastRun: lastRun
      ? { id: lastRun.id, status: lastRun.status, passed: lastRun.passed, failed: lastRun.failed }
      : null,
    customPrompt,
  };
}
