import type { SystemMapNode as PrismaNode, SystemMapEdge as PrismaEdge } from "@/generated/prisma/client";
import type { OperationsMap } from "@/agents/schemas/operations-map";
import type { Journey } from "@/services/planning/journey-reconstructor";

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

/**
 * Enrich existing keyword-based journeys with operations map data:
 * operation coverage, dependency ordering, and critical path flagging.
 */
export function enrichJourneysWithOperations(
  journeys: Journey[],
  operationsMap: OperationsMap
): void {
  const depsByOp = new Map<string, string[]>();
  for (const dep of operationsMap.dependencies) {
    depsByOp.set(dep.operationId, dep.dependsOn);
  }

  const nodeToOps = new Map<string, string[]>();
  for (const op of operationsMap.operations) {
    for (const nodeId of op.nodeIds) {
      if (!nodeToOps.has(nodeId)) nodeToOps.set(nodeId, []);
      nodeToOps.get(nodeId)!.push(op.id);
    }
  }

  const criticalOpIds = new Set<string>();
  for (const flow of operationsMap.flows) {
    if (flow.criticalPath) {
      for (const opId of flow.operations) criticalOpIds.add(opId);
    }
  }

  for (const journey of journeys) {
    const coveredOps = new Set<string>();
    for (const nodeId of journey.nodeIds) {
      const ops = nodeToOps.get(nodeId);
      if (ops) ops.forEach((opId) => coveredOps.add(opId));
    }
    journey.operationIds = Array.from(coveredOps);

    const depJourneyNames = new Set<string>();
    for (const opId of Array.from(coveredOps)) {
      const deps = depsByOp.get(opId);
      if (!deps) continue;
      for (const depOpId of deps) {
        for (const other of journeys) {
          if (other === journey) continue;
          const otherOps = new Set(other.operationIds ?? []);
          if (otherOps.has(depOpId)) {
            depJourneyNames.add(other.name);
          }
        }
      }
    }
    if (depJourneyNames.size > 0) {
      journey.dependsOn = Array.from(depJourneyNames);
    }

    const touchesCritical = Array.from(coveredOps).some((opId) => criticalOpIds.has(opId));
    if (touchesCritical) {
      journey.isCriticalPath = true;
    }
  }
}

/**
 * Build journey steps for an operation's nodes, ordered by graph adjacency.
 */
export function buildOperationSteps(
  nodeIds: string[],
  nodeMap: Map<string, PrismaNode>,
  adjacency: AdjacencyMap
): JourneyStep[] {
  const nodeIdSet = new Set(nodeIds);
  const targeted = new Set<string>();
  for (const nodeId of nodeIds) {
    const neighbors = adjacency[nodeId] ?? [];
    for (const n of neighbors) {
      if (nodeIdSet.has(n.targetId)) targeted.add(n.targetId);
    }
  }

  const startCandidates = nodeIds.filter((id) => !targeted.has(id));
  const startId = startCandidates[0] ?? nodeIds[0];
  if (!startId) return [];

  const visited = new Set<string>();
  const steps: JourneyStep[] = [];
  const queue: Array<{ nodeId: string; relationship: string | null }> = [
    { nodeId: startId, relationship: null },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.nodeId)) continue;
    visited.add(current.nodeId);

    const node = nodeMap.get(current.nodeId);
    if (!node) continue;

    steps.push({
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      filePath: node.filePath,
      relationship: current.relationship,
    });

    const neighbors = adjacency[current.nodeId] ?? [];
    for (const n of neighbors) {
      if (nodeIdSet.has(n.targetId) && !visited.has(n.targetId)) {
        queue.push({ nodeId: n.targetId, relationship: n.relationship });
      }
    }
  }

  // Add unreachable nodes in the operation (disconnected subgraphs)
  for (const nodeId of nodeIds) {
    if (!visited.has(nodeId)) {
      const node = nodeMap.get(nodeId);
      if (node) {
        steps.push({
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          filePath: node.filePath,
          relationship: null,
        });
      }
    }
  }

  return steps;
}

/**
 * Build a map of flow ID -> dependent flow IDs based on operation dependencies.
 */
export function buildFlowDependencyMap(
  operationsMap: OperationsMap
): Map<string, string[]> {
  const depsByOp = new Map<string, string[]>();
  for (const dep of operationsMap.dependencies) {
    depsByOp.set(dep.operationId, dep.dependsOn);
  }

  const opToFlows = new Map<string, string[]>();
  for (const flow of operationsMap.flows) {
    for (const opId of flow.operations) {
      if (!opToFlows.has(opId)) opToFlows.set(opId, []);
      opToFlows.get(opId)!.push(flow.id);
    }
  }

  const flowDepMap = new Map<string, string[]>();

  for (const flow of operationsMap.flows) {
    const depFlowIds = new Set<string>();
    for (const opId of flow.operations) {
      const deps = depsByOp.get(opId);
      if (!deps) continue;
      for (const depOpId of deps) {
        const ownerFlows = opToFlows.get(depOpId) ?? [];
        for (const fId of ownerFlows) {
          if (fId !== flow.id) depFlowIds.add(fId);
        }
      }
    }
    if (depFlowIds.size > 0) {
      flowDepMap.set(flow.id, Array.from(depFlowIds));
    }
  }

  return flowDepMap;
}
