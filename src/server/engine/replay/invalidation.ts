import { prisma } from "@/lib/db";

/**
 * Code changed: find the System Map nodes in the changed files plus their
 * 1-hop neighbours, and mark every active script covering one of them
 * `suspect`. Suspect scripts still replay, but with 2s locator timeouts, so
 * a broken one diverges to the agent quickly instead of waiting out the
 * normal timeout. A clean replay makes the script active again.
 */
export async function affectedNodeIds(projectId: string, changedFiles: string[]): Promise<string[]> {
  if (changedFiles.length === 0) return [];
  const nodes = await prisma.systemMapNode.findMany({
    where: { projectId, filePath: { in: changedFiles } },
    select: { id: true },
  });
  const ids = new Set(nodes.map((n) => n.id));
  if (ids.size === 0) return [];

  const changed = Array.from(ids);
  const edges = await prisma.systemMapEdge.findMany({
    where: { projectId, OR: [{ sourceNodeId: { in: changed } }, { targetNodeId: { in: changed } }] },
    select: { sourceNodeId: true, targetNodeId: true },
  });
  for (const edge of edges) {
    ids.add(edge.sourceNodeId);
    ids.add(edge.targetNodeId);
  }
  return Array.from(ids);
}

export async function markScriptsSuspect(projectId: string, changedFiles: string[]): Promise<number> {
  const nodeIds = await affectedNodeIds(projectId, changedFiles);
  if (nodeIds.length === 0) return 0;
  const { count } = await prisma.testScript.updateMany({
    where: { projectId, status: "active", coveredNodeIds: { hasSome: nodeIds } },
    data: { status: "suspect" },
  });
  return count;
}
