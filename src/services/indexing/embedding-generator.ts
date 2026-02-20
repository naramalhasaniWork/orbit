import { createEmbeddings } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

interface EmbeddingInput {
  nodeId: string;
  text: string;
}

interface EmbeddingResult {
  nodeId: string;
  embedding: number[];
}

const BATCH_SIZE = 50;

function buildEmbeddingText(node: {
  type: string;
  name: string;
  filePath: string;
  metadata: Record<string, unknown>;
}): string {
  const parts: string[] = [
    `Type: ${node.type}`,
    `Name: ${node.name}`,
    `File: ${node.filePath}`,
  ];

  if (node.metadata.httpMethod) {
    parts.push(`HTTP Method: ${String(node.metadata.httpMethod)}`);
  }
  if (node.metadata.description) {
    parts.push(`Description: ${String(node.metadata.description)}`);
  }
  if (node.metadata.authRequired !== undefined) {
    parts.push(`Auth Required: ${String(node.metadata.authRequired)}`);
  }
  if (Array.isArray(node.metadata.exports) && node.metadata.exports.length > 0) {
    parts.push(`Exports: ${node.metadata.exports.join(", ")}`);
  }
  if (Array.isArray(node.metadata.params) && node.metadata.params.length > 0) {
    parts.push(`Params: ${node.metadata.params.join(", ")}`);
  }

  return parts.join("\n");
}

async function generateBatch(
  inputs: EmbeddingInput[]
): Promise<EmbeddingResult[]> {
  const texts = inputs.map((i) => i.text);
  const embeddings = await createEmbeddings(texts);

  return inputs.map((input, index) => ({
    nodeId: input.nodeId,
    embedding: embeddings[index] ?? [],
  }));
}

export async function generateAndStoreEmbeddings(
  projectId: string
): Promise<number> {
  const nodes = await prisma.systemMapNode.findMany({
    where: { projectId, embedding: { equals: Prisma.DbNull } },
    select: {
      id: true,
      type: true,
      name: true,
      filePath: true,
      metadata: true,
    },
  });

  if (nodes.length === 0) return 0;

  let processed = 0;

  for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
    const batch = nodes.slice(i, i + BATCH_SIZE);

    const inputs: EmbeddingInput[] = batch.map((node) => ({
      nodeId: node.id,
      text: buildEmbeddingText({
        type: node.type,
        name: node.name,
        filePath: node.filePath,
        metadata: node.metadata as Record<string, unknown>,
      }),
    }));

    const results = await generateBatch(inputs);

    // Store embeddings in both JSONB and pgvector columns
    for (const result of results) {
      await prisma.systemMapNode.update({
        where: { id: result.nodeId },
        data: { embedding: result.embedding },
      });

      // Also store in native pgvector column if available
      await storeVectorEmbedding(result.nodeId, result.embedding);
    }

    processed += results.length;
  }

  return processed;
}

export async function generateEmbeddingForNode(
  nodeId: string
): Promise<number[]> {
  const node = await prisma.systemMapNode.findUniqueOrThrow({
    where: { id: nodeId },
    select: {
      type: true,
      name: true,
      filePath: true,
      metadata: true,
    },
  });

  const text = buildEmbeddingText({
    type: node.type,
    name: node.name,
    filePath: node.filePath,
    metadata: node.metadata as Record<string, unknown>,
  });

  const [embedding] = await createEmbeddings([text]);
  if (!embedding) throw new Error("Failed to generate embedding");

  await prisma.systemMapNode.update({
    where: { id: nodeId },
    data: { embedding },
  });

  // Also store in native pgvector column if available
  await storeVectorEmbedding(nodeId, embedding);

  return embedding;
}

/**
 * Store embedding in the native pgvector column (embedding_vec).
 * Falls back silently if pgvector extension is not installed.
 */
async function storeVectorEmbedding(nodeId: string, embedding: number[]): Promise<void> {
  try {
    const vectorStr = `[${embedding.join(",")}]`;
    await prisma.$executeRawUnsafe(
      `UPDATE system_map_nodes SET embedding_vec = $1::vector WHERE id = $2::uuid`,
      vectorStr,
      nodeId
    );
  } catch {
    // pgvector column may not exist — fall back to JSONB storage only
  }
}

/**
 * Initialize pgvector extension and column if not already present.
 * Call this during app startup or migration.
 */
export async function initPgvectorColumn(): Promise<boolean> {
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "system_map_nodes" ADD COLUMN IF NOT EXISTS embedding_vec vector(1536)`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_system_map_nodes_embedding_vec
       ON "system_map_nodes" USING ivfflat (embedding_vec vector_cosine_ops) WITH (lists = 100)`
    );
    return true;
  } catch {
    console.warn("[pgvector] Extension not available, falling back to JSONB embeddings");
    return false;
  }
}

export { buildEmbeddingText };
export type { EmbeddingInput, EmbeddingResult };
