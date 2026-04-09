import { prisma } from "@/lib/db";
import { findSimilarNodes } from "@/lib/db/vector";
import { createEmbedding } from "@/lib/ai";
import type { SystemMapNode as PrismaNode, SystemMapEdge as PrismaEdge } from "@/generated/prisma/client";
import type { OperationsMap } from "@/agents/schemas/operations-map";
import {
  enrichJourneysWithOperations,
  buildOperationSteps,
  buildFlowDependencyMap,
} from "@/services/planning/journey-operations";

export interface Journey {
  name: string;
  description: string;
  steps: JourneyStep[];
  entryNodeId: string;
  nodeIds: string[];
  dependsOn?: string[];
  operationIds?: string[];
  isCriticalPath?: boolean;
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

const SEMANTIC_CLASSIFICATION_THRESHOLD = 0.8;

async function classifyNodeSemantic(
  node: PrismaNode,
  projectId: string,
  classifiedNodes: Map<string, string>
): Promise<string | null> {
  try {
    const text = `${node.name} ${node.filePath}`;
    const embedding = await createEmbedding(text);
    const similar = await findSimilarNodes(projectId, embedding, 5);

    for (const match of similar) {
      if (match.similarity < SEMANTIC_CLASSIFICATION_THRESHOLD) continue;
      if (match.id === node.id) continue;
      const classification = classifiedNodes.get(match.id);
      if (classification) return classification;
    }
  } catch {
    // Semantic classification unavailable, return null
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

export async function reconstructJourneys(
  projectId: string,
  operationsMap?: OperationsMap,
  useSemanticClassification = false
): Promise<Journey[]> {
  const [nodes, edges] = await Promise.all([
    prisma.systemMapNode.findMany({ where: { projectId } }),
    prisma.systemMapEdge.findMany({ where: { projectId } }),
  ]);

  const nodeMap = new Map<string, PrismaNode>();
  for (const node of nodes) nodeMap.set(node.id, node);

  const adjacency = buildAdjacencyMap(edges);

  // Standard keyword-based journeys, optionally enhanced with semantic classification
  const journeys = await buildKeywordJourneysAsync(
    nodes,
    nodeMap,
    adjacency,
    useSemanticClassification ? projectId : undefined
  );

  // Enrich with operations map data if available
  if (operationsMap) {
    enrichJourneysWithOperations(journeys, operationsMap);
  }

  return journeys;
}

/**
 * Build journeys from OperationsMap flows instead of keyword matching.
 * Each OperationalFlow becomes a journey, with steps ordered by
 * the operation sequence defined in the flow.
 */
export function reconstructFlowJourneys(
  nodes: PrismaNode[],
  edges: PrismaEdge[],
  operationsMap: OperationsMap
): Journey[] {
  const nodeMap = new Map<string, PrismaNode>();
  for (const node of nodes) nodeMap.set(node.id, node);

  const adjacency = buildAdjacencyMap(edges);
  const operationById = new Map(operationsMap.operations.map((op) => [op.id, op]));

  // Map flow IDs to dependent flow IDs (for journey-level dependsOn)
  const flowDepMap = buildFlowDependencyMap(operationsMap);

  const journeys: Journey[] = [];

  for (const flow of operationsMap.flows) {
    const steps: JourneyStep[] = [];
    const allNodeIds: string[] = [];

    // Walk operations in flow order
    for (const opId of flow.operations) {
      const operation = operationById.get(opId);
      if (!operation) continue;

      const opSteps = buildOperationSteps(operation.nodeIds, nodeMap, adjacency);
      steps.push(...opSteps);
      allNodeIds.push(...operation.nodeIds);
    }

    if (steps.length === 0) continue;

    const entryNodeId = steps[0].nodeId;
    const uniqueNodeIds = Array.from(new Set(allNodeIds));

    journeys.push({
      name: flow.name,
      description: flow.description,
      steps,
      entryNodeId,
      nodeIds: uniqueNodeIds,
      dependsOn: flowDepMap.get(flow.id),
      operationIds: flow.operations,
      isCriticalPath: flow.criticalPath,
    });
  }

  return journeys;
}

// --- Internal helpers ---

function buildKeywordJourneys(
  nodes: PrismaNode[],
  nodeMap: Map<string, PrismaNode>,
  adjacency: AdjacencyMap
): Journey[] {
  const journeyGroups = new Map<string, PrismaNode[]>();

  for (const node of nodes) {
    const journeyName = classifyNode(node);
    if (journeyName) {
      if (!journeyGroups.has(journeyName)) journeyGroups.set(journeyName, []);
      journeyGroups.get(journeyName)!.push(node);
    }
  }

  return assembleJourneys(nodes, journeyGroups, nodeMap, adjacency);
}

async function buildKeywordJourneysAsync(
  nodes: PrismaNode[],
  nodeMap: Map<string, PrismaNode>,
  adjacency: AdjacencyMap,
  semanticProjectId?: string
): Promise<Journey[]> {
  const journeyGroups = new Map<string, PrismaNode[]>();
  const classifiedNodes = new Map<string, string>();

  // First pass: keyword classification
  for (const node of nodes) {
    const journeyName = classifyNode(node);
    if (journeyName) {
      if (!journeyGroups.has(journeyName)) journeyGroups.set(journeyName, []);
      journeyGroups.get(journeyName)!.push(node);
      classifiedNodes.set(node.id, journeyName);
    }
  }

  // Second pass: semantic classification for unclassified nodes
  if (semanticProjectId && classifiedNodes.size > 0) {
    const unclassified = nodes.filter((n) => !classifiedNodes.has(n.id));
    for (const node of unclassified) {
      const journeyName = await classifyNodeSemantic(
        node,
        semanticProjectId,
        classifiedNodes
      );
      if (journeyName) {
        if (!journeyGroups.has(journeyName)) journeyGroups.set(journeyName, []);
        journeyGroups.get(journeyName)!.push(node);
        classifiedNodes.set(node.id, journeyName);
      }
    }
  }

  return assembleJourneys(nodes, journeyGroups, nodeMap, adjacency);
}

function assembleJourneys(
  nodes: PrismaNode[],
  journeyGroups: Map<string, PrismaNode[]>,
  nodeMap: Map<string, PrismaNode>,
  adjacency: AdjacencyMap
): Journey[] {
  const classifiedIds = new Set<string>();
  for (const group of Array.from(journeyGroups.values())) {
    for (const node of group) classifiedIds.add(node.id);
  }

  const unclassifiedRoutes = nodes.filter(
    (n) => !classifiedIds.has(n.id) && (n.type === "route" || n.type === "endpoint")
  );
  if (unclassifiedRoutes.length > 0) {
    journeyGroups.set("core", unclassifiedRoutes);
  }

  const journeys: Journey[] = [];
  const MAX_WALK_DEPTH = 8;

  for (const [name, groupNodes] of Array.from(journeyGroups.entries())) {
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
