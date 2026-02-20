import { createEmbeddings } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { setNodeEmbedding, batchSetEmbeddings } from "@/lib/db/vector";

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
  // Find nodes without embeddings using raw SQL since
  // Prisma can't filter on Unsupported vector columns
  const nodesWithoutEmbeddings = await prisma.$queryRawUnsafe<
    Array<{ id: string }>
  >(
    `SELECT id FROM system_map_nodes WHERE project_id = $1::uuid AND embedding IS NULL`,
    projectId
  );

  if (nodesWithoutEmbeddings.length === 0) return 0;

  const nodeIds = new Set(nodesWithoutEmbeddings.map((n) => n.id));
  const nodes = await prisma.systemMapNode.findMany({
    where: { projectId, id: { in: Array.from(nodeIds) } },
    select: { id: true, type: true, name: true, filePath: true, metadata: true },
  });

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

    await batchSetEmbeddings(
      results.map((r) => ({ nodeId: r.nodeId, embedding: r.embedding }))
    );

    processed += results.length;
  }

  return processed;
}

export async function generateEmbeddingForNode(
  nodeId: string
): Promise<number[]> {
  const node = await prisma.systemMapNode.findUniqueOrThrow({
    where: { id: nodeId },
    select: { type: true, name: true, filePath: true, metadata: true },
  });

  const text = buildEmbeddingText({
    type: node.type,
    name: node.name,
    filePath: node.filePath,
    metadata: node.metadata as Record<string, unknown>,
  });

  const [embedding] = await createEmbeddings([text]);
  if (!embedding) throw new Error("Failed to generate embedding");

  await setNodeEmbedding(nodeId, embedding);

  return embedding;
}

export { buildEmbeddingText };
export type { EmbeddingInput, EmbeddingResult };
