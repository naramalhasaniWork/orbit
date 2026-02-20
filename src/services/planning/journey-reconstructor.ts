import { prisma } from "@/lib/db";
import type { SystemMapNode as PrismaNode, SystemMapEdge as PrismaEdge } from "@/generated/prisma/client";

export interface Journey {
  name: string;
  description: string;
  steps: JourneyStep[];
  entryNodeId: string;
  nodeIds: string[];
}

interface JourneyStep {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  filePath: string;
  relationship: string | null;
}

interface AdjacencyMap {
  [nodeId: string]: Array<{ targetId: string; relationship: string }>;
}

const JOURNEY_PATTERNS: Record<string, string[]> = {
  authentication: ["login", "signin", "sign-in", "auth", "register", "signup", "sign-up"],
  onboarding: ["onboard", "welcome", "setup", "getting-started"],
  dashboard: ["dashboard", "home", "overview"],
  settings: ["settings", "profile", "account", "preferences"],
  checkout: ["checkout", "payment", "billing", "cart", "order"],
  crud: ["create", "edit", "update", "delete", "new", "list"],
};

function buildAdjacencyMap(edges: PrismaEdge[]): AdjacencyMap {
  const adj: AdjacencyMap = {};
  for (const edge of edges) {
    if (!adj[edge.sourceNodeId]) adj[edge.sourceNodeId] = [];
    adj[edge.sourceNodeId].push({
      targetId: edge.targetNodeId,
      relationship: edge.relationship,
    });
  }
  return adj;
}

function classifyNode(node: PrismaNode): string | null {
  const nameLower = node.name.toLowerCase();
  const pathLower = node.filePath.toLowerCase();

  for (const [journey, keywords] of Object.entries(JOURNEY_PATTERNS)) {
    for (const keyword of keywords) {
      if (nameLower.includes(keyword) || pathLower.includes(keyword)) {
        return journey;
      }
    }
  }
  return null;
}

function walkGraph(
  startNodeId: string,
  adjacency: AdjacencyMap,
  nodeMap: Map<string, PrismaNode>,
  maxDepth: number
): JourneyStep[] {
  const visited = new Set<string>();
  const steps: JourneyStep[] = [];

  function dfs(nodeId: string, relationship: string | null, depth: number) {
    if (depth > maxDepth || visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = nodeMap.get(nodeId);
    if (!node) return;

    steps.push({
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      filePath: node.filePath,
      relationship,
    });

    const neighbors = adjacency[nodeId] ?? [];
    for (const neighbor of neighbors) {
      dfs(neighbor.targetId, neighbor.relationship, depth + 1);
    }
  }

  dfs(startNodeId, null, 0);
  return steps;
}

function describeJourney(name: string, steps: JourneyStep[]): string {
  const routeSteps = steps.filter((s) => s.nodeType === "route");
  if (routeSteps.length === 0) {
    return `User journey through ${name} flow`;
  }
  const routeNames = routeSteps.map((s) => s.nodeName).join(" -> ");
  return `User navigates: ${routeNames}`;
}

export async function reconstructJourneys(projectId: string): Promise<Journey[]> {
  const [nodes, edges] = await Promise.all([
    prisma.systemMapNode.findMany({ where: { projectId } }),
    prisma.systemMapEdge.findMany({ where: { projectId } }),
  ]);

  const nodeMap = new Map<string, PrismaNode>();
  for (const node of nodes) nodeMap.set(node.id, node);

  const adjacency = buildAdjacencyMap(edges);
  const journeyGroups = new Map<string, PrismaNode[]>();

  // Group nodes by journey classification
  for (const node of nodes) {
    const journeyName = classifyNode(node);
    if (journeyName) {
      if (!journeyGroups.has(journeyName)) journeyGroups.set(journeyName, []);
      journeyGroups.get(journeyName)!.push(node);
    }
  }

  // For unclassified route/endpoint nodes, group as "core"
  const classifiedIds = new Set<string>();
  Array.from(journeyGroups.values()).forEach((group) => {
    group.forEach((node) => classifiedIds.add(node.id));
  });

  const unclassifiedRoutes = nodes.filter(
    (n) => !classifiedIds.has(n.id) && (n.type === "route" || n.type === "endpoint")
  );
  if (unclassifiedRoutes.length > 0) {
    journeyGroups.set("core", unclassifiedRoutes);
  }

  // Build journeys by walking the graph from entry points
  const journeys: Journey[] = [];
  const MAX_WALK_DEPTH = 8;

  for (const [name, groupNodes] of Array.from(journeyGroups.entries())) {
    // Pick the best entry point: prefer routes, then endpoints
    const entryNode = groupNodes.find((n: PrismaNode) => n.type === "route")
      ?? groupNodes.find((n: PrismaNode) => n.type === "endpoint")
      ?? groupNodes[0];

    if (!entryNode) continue;

    const steps = walkGraph(entryNode.id, adjacency, nodeMap, MAX_WALK_DEPTH);
    if (steps.length === 0) continue;

    journeys.push({
      name,
      description: describeJourney(name, steps),
      steps,
      entryNodeId: entryNode.id,
      nodeIds: steps.map((s) => s.nodeId),
    });
  }

  return journeys;
}
