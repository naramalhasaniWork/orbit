import { prisma } from "@/lib/db";
import type { ChangeStatus, MapEdge, MapNode, TestStatus } from "@/components/dashboard/map-types";

/** A node's test status: the worst latest verdict among the enabled tests of the journey named like it. */
export function nodeTestStatuses(
  nodes: { id: string; name: string }[],
  testCases: { journey: string | null; lastVerdict: string | null }[]
): Map<string, TestStatus> {
  const journeyVerdicts = new Map<string, Set<string>>();
  for (const tc of testCases) {
    if (!tc.journey) continue;
    const verdicts = journeyVerdicts.get(tc.journey) ?? new Set<string>();
    if (tc.lastVerdict) verdicts.add(tc.lastVerdict);
    journeyVerdicts.set(tc.journey, verdicts);
  }
  const statuses = new Map<string, TestStatus>();
  for (const node of nodes) {
    const v = journeyVerdicts.get(node.name);
    statuses.set(
      node.id,
      !v ? "untested" : v.has("fail") ? "fail" : v.has("flaky") ? "flaky" : v.has("pass") || v.has("healed") ? "pass" : "untested"
    );
  }
  return statuses;
}

/** The project's System Map with test and change status per node: three queries, in parallel. */
export async function getMapGraph(projectId: string): Promise<{ nodes: MapNode[]; edges: MapEdge[] }> {
  const [dbNodes, dbEdges, testCases] = await Promise.all([
    prisma.systemMapNode.findMany({
      where: { projectId },
      select: { id: true, type: true, name: true, filePath: true, metadata: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.systemMapEdge.findMany({
      where: { projectId },
      select: { id: true, sourceNodeId: true, targetNodeId: true, relationship: true },
    }),
    prisma.testCase.findMany({ where: { projectId, isEnabled: true }, select: { journey: true, lastVerdict: true } }),
  ]);
  const statuses = nodeTestStatuses(dbNodes, testCases);
  const nodes: MapNode[] = dbNodes.map((n) => {
    const meta = n.metadata as Record<string, unknown> | null;
    return {
      id: n.id,
      type: n.type as MapNode["type"],
      name: n.name,
      filePath: n.filePath,
      metadata: meta,
      testStatus: statuses.get(n.id) ?? "untested",
      changeStatus: (meta?.changeStatus as ChangeStatus) ?? undefined,
    };
  });
  const edges: MapEdge[] = dbEdges.map((e) => ({
    id: e.id,
    sourceId: e.sourceNodeId,
    targetId: e.targetNodeId,
    relationship: e.relationship,
  }));
  return { nodes, edges };
}
