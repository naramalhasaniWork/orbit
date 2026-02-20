import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SystemMap } from "@/components/dashboard/system-map";
import type { MapNode, MapEdge, TestStatus } from "@/components/dashboard/map-types";

export default async function MapPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const workspaceId = (session as { workspaceId?: string }).workspaceId;
  if (!workspaceId) redirect("/login");

  const project = await prisma.project.findFirst({
    where: { workspaceId, status: "active" },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true },
  });

  if (!project) redirect("/dashboard");

  const [dbNodes, dbEdges] = await Promise.all([
    prisma.systemMapNode.findMany({
      where: { projectId: project.id },
      select: {
        id: true,
        type: true,
        name: true,
        filePath: true,
        metadata: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.systemMapEdge.findMany({
      where: { projectId: project.id },
      select: {
        id: true,
        sourceNodeId: true,
        targetNodeId: true,
        relationship: true,
      },
    }),
  ]);

  // Determine test status per node from latest test results
  const nodeTestStatuses = await getNodeTestStatuses(project.id);

  const nodes: MapNode[] = dbNodes.map((n) => ({
    id: n.id,
    type: n.type as MapNode["type"],
    name: n.name,
    filePath: n.filePath,
    metadata: n.metadata as Record<string, unknown> | null,
    testStatus: nodeTestStatuses.get(n.id) ?? ("untested" as TestStatus),
  }));

  const edges: MapEdge[] = dbEdges.map((e) => ({
    id: e.id,
    sourceId: e.sourceNodeId,
    targetId: e.targetNodeId,
    relationship: e.relationship,
  }));

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-between px-1 pb-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">System Map</h1>
          <p className="text-xs text-muted-foreground">
            {project.name} -- {nodes.length} nodes, {edges.length} edges
          </p>
        </div>
      </div>
      <div className="flex-1 min-h-0 rounded-xl surface-1 overflow-hidden">
        <SystemMap nodes={nodes} edges={edges} />
      </div>
    </div>
  );
}

async function getNodeTestStatuses(
  projectId: string
): Promise<Map<string, TestStatus>> {
  const statuses = new Map<string, TestStatus>();

  // Get test cases with their journeys and latest verdicts
  const testCases = await prisma.testCase.findMany({
    where: { projectId, isEnabled: true },
    select: {
      journey: true,
      lastVerdict: true,
    },
  });

  // Map journeys to verdict summaries
  const journeyVerdicts = new Map<string, Set<string>>();
  for (const tc of testCases) {
    if (!tc.journey) continue;
    const verdicts = journeyVerdicts.get(tc.journey) ?? new Set<string>();
    if (tc.lastVerdict) verdicts.add(tc.lastVerdict);
    journeyVerdicts.set(tc.journey, verdicts);
  }

  // Get nodes and match to journeys by name
  const nodes = await prisma.systemMapNode.findMany({
    where: { projectId },
    select: { id: true, name: true },
  });

  for (const node of nodes) {
    const verdicts = journeyVerdicts.get(node.name);
    if (!verdicts || verdicts.size === 0) {
      statuses.set(node.id, "untested");
      continue;
    }

    if (verdicts.has("fail")) {
      statuses.set(node.id, "fail");
    } else if (verdicts.has("flaky")) {
      statuses.set(node.id, "flaky");
    } else if (verdicts.has("pass") || verdicts.has("healed")) {
      statuses.set(node.id, "pass");
    } else {
      statuses.set(node.id, "untested");
    }
  }

  return statuses;
}
