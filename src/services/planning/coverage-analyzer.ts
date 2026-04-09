import { prisma } from "@/lib/db";
import { findSimilarNodes } from "@/lib/db/vector";
import { createEmbedding } from "@/lib/ai";
import type { SystemMapNode as PrismaNode, TestCase as PrismaTestCase } from "@/generated/prisma/client";
import type { OperationsMap } from "@/agents/schemas/operations-map";

// Minimum node-name length for fuzzy matching — prevents short tokens like
// "list", "id", "new" from matching every test case that mentions them.
const MIN_NODE_NAME_MATCH_LENGTH = 5;

interface NodeCoverage {
  nodeId: string;
  nodeType: string;
  nodeName: string;
  filePath: string;
  isCovered: boolean;
  testCaseCount: number;
}

interface JourneyCoverage {
  journey: string;
  totalNodes: number;
  coveredNodes: number;
  percentage: number;
}

interface OperationCoverage {
  operationId: string;
  operationName: string;
  isCovered: boolean;
  testCaseCount: number;
}

interface FlowCoverage {
  flowId: string;
  flowName: string;
  totalOperations: number;
  coveredOperations: number;
  percentage: number;
  isFullyCovered: boolean;
  isCriticalPath: boolean;
}

export interface CoverageReport {
  totalNodes: number;
  coveredNodes: number;
  overallPercentage: number;
  untestedRoutes: NodeCoverage[];
  untestedEndpoints: NodeCoverage[];
  untestedComponents: NodeCoverage[];
  coverageByJourney: JourneyCoverage[];
  coverageByType: Record<string, { total: number; covered: number; percentage: number }>;
  coverageByOperation?: OperationCoverage[];
  coverageByFlow?: FlowCoverage[];
}

function buildNodeCoverage(
  node: PrismaNode,
  coveredNodeNames: Set<string>
): NodeCoverage {
  const isCovered = coveredNodeNames.has(node.name);
  return {
    nodeId: node.id,
    nodeType: node.type,
    nodeName: node.name,
    filePath: node.filePath,
    isCovered,
    testCaseCount: isCovered ? 1 : 0,
  };
}

function computeTypeCoverage(
  nodes: PrismaNode[],
  coveredNodeNames: Set<string>
): Record<string, { total: number; covered: number; percentage: number }> {
  const byType: Record<string, { total: number; covered: number }> = {};

  for (const node of nodes) {
    if (!byType[node.type]) {
      byType[node.type] = { total: 0, covered: 0 };
    }
    byType[node.type].total++;
    if (coveredNodeNames.has(node.name)) {
      byType[node.type].covered++;
    }
  }

  const result: Record<string, { total: number; covered: number; percentage: number }> = {};
  for (const [type, data] of Object.entries(byType)) {
    result[type] = {
      ...data,
      percentage: data.total > 0 ? Math.round((data.covered / data.total) * 100) : 0,
    };
  }
  return result;
}

function computeJourneyCoverage(
  testCases: Pick<PrismaTestCase, "journey">[],
  nodes: PrismaNode[],
  coveredNodeNames: Set<string>
): JourneyCoverage[] {
  const journeySet = new Set<string>();
  for (const tc of testCases) {
    if (tc.journey) journeySet.add(tc.journey);
  }

  // For journeys with no test cases yet, derive from node types
  const routeNodes = nodes.filter((n) => n.type === "route");
  if (journeySet.size === 0 && routeNodes.length > 0) {
    return [{
      journey: "uncategorized",
      totalNodes: routeNodes.length,
      coveredNodes: routeNodes.filter((n) => coveredNodeNames.has(n.name)).length,
      percentage: 0,
    }];
  }

  return Array.from(journeySet).map((journey) => {
    // Approximate: count route nodes whose names relate to the journey
    const related = routeNodes.filter((n) =>
      n.name.toLowerCase().includes(journey.toLowerCase()) ||
      n.filePath.toLowerCase().includes(journey.toLowerCase())
    );
    const total = Math.max(related.length, 1);
    const covered = related.filter((n) => coveredNodeNames.has(n.name)).length;

    return {
      journey,
      totalNodes: total,
      coveredNodes: covered,
      percentage: Math.round((covered / total) * 100),
    };
  });
}

function computeOperationCoverage(
  operationsMap: OperationsMap,
  coveredNodeNames: Set<string>,
  nodeMap: Map<string, PrismaNode>
): OperationCoverage[] {
  return operationsMap.operations.map((op) => {
    // An operation is covered if at least one of its nodes is covered
    const coveredCount = op.nodeIds.filter((nodeId) => {
      const node = nodeMap.get(nodeId);
      return node && coveredNodeNames.has(node.name);
    }).length;

    return {
      operationId: op.id,
      operationName: op.name,
      isCovered: coveredCount > 0,
      testCaseCount: coveredCount,
    };
  });
}

function computeFlowCoverage(
  operationsMap: OperationsMap,
  operationCoverage: OperationCoverage[]
): FlowCoverage[] {
  const opCoverageById = new Map(
    operationCoverage.map((oc) => [oc.operationId, oc])
  );

  return operationsMap.flows.map((flow) => {
    const totalOperations = flow.operations.length;
    const coveredOperations = flow.operations.filter((opId) => {
      const oc = opCoverageById.get(opId);
      return oc?.isCovered ?? false;
    }).length;

    const percentage = totalOperations > 0
      ? Math.round((coveredOperations / totalOperations) * 100)
      : 0;

    return {
      flowId: flow.id,
      flowName: flow.name,
      totalOperations,
      coveredOperations,
      percentage,
      isFullyCovered: coveredOperations === totalOperations && totalOperations > 0,
      isCriticalPath: flow.criticalPath,
    };
  });
}

function fallbackTextMatch(
  testCases: Pick<PrismaTestCase, "name" | "journey">[],
  nodes: PrismaNode[]
): Set<string> {
  const coveredNodeNames = new Set<string>();
  for (const tc of testCases) {
    const tcNameLower = tc.name.toLowerCase();
    const tcJourney = tc.journey?.toLowerCase() ?? "";

    for (const node of nodes) {
      const nodeNameLower = node.name.toLowerCase();
      const nodePathLower = node.filePath.toLowerCase();

      const journeyMatch =
        tcJourney.length >= 3 &&
        (nodeNameLower.includes(tcJourney) || nodePathLower.includes(tcJourney));

      const nameMatch =
        nodeNameLower.length >= MIN_NODE_NAME_MATCH_LENGTH &&
        tcNameLower.includes(nodeNameLower);

      if (journeyMatch || nameMatch) {
        coveredNodeNames.add(node.name);
      }
    }
  }
  return coveredNodeNames;
}

const SEMANTIC_SIMILARITY_THRESHOLD = 0.75;

async function semanticMatchForTestCase(
  projectId: string,
  tc: Pick<PrismaTestCase, "name" | "journey">
): Promise<string[]> {
  const text = `${tc.name} ${tc.journey ?? ""}`.trim();
  const embedding = await createEmbedding(text);
  const similar = await findSimilarNodes(projectId, embedding, 5);
  return similar
    .filter((n) => n.similarity >= SEMANTIC_SIMILARITY_THRESHOLD)
    .map((n) => n.name);
}

export async function analyzeCoverage(
  projectId: string,
  operationsMap?: OperationsMap,
  useSemanticMatching = false
): Promise<CoverageReport> {
  const [nodes, existingTestCases] = await Promise.all([
    prisma.systemMapNode.findMany({ where: { projectId } }),
    prisma.testCase.findMany({
      where: {
        projectId,
        isEnabled: true,
        testPlan: { isActive: true },
      },
      select: { name: true, journey: true },
    }),
  ]);

  const nodeMap = new Map<string, PrismaNode>();
  for (const node of nodes) nodeMap.set(node.id, node);

  // Start with text-based matching as baseline
  const coveredNodeNames = fallbackTextMatch(existingTestCases, nodes);

  // Augment with semantic matching when enabled
  if (useSemanticMatching) {
    for (const tc of existingTestCases) {
      try {
        const semanticNames = await semanticMatchForTestCase(projectId, tc);
        for (const name of semanticNames) coveredNodeNames.add(name);
      } catch {
        // Per-test-case fallback: text matching already applied above
      }
    }
  }

  const allCoverage = nodes.map((n) => buildNodeCoverage(n, coveredNodeNames));
  const untested = allCoverage.filter((c) => !c.isCovered);

  const coveredCount = allCoverage.filter((c) => c.isCovered).length;
  const overallPercentage = nodes.length > 0
    ? Math.round((coveredCount / nodes.length) * 100)
    : 0;

  const report: CoverageReport = {
    totalNodes: nodes.length,
    coveredNodes: coveredCount,
    overallPercentage,
    untestedRoutes: untested.filter((c) => c.nodeType === "route"),
    untestedEndpoints: untested.filter((c) => c.nodeType === "endpoint"),
    untestedComponents: untested.filter((c) => c.nodeType === "component"),
    coverageByJourney: computeJourneyCoverage(existingTestCases, nodes, coveredNodeNames),
    coverageByType: computeTypeCoverage(nodes, coveredNodeNames),
  };

  // Add operation and flow coverage when operations map is provided
  if (operationsMap) {
    const opCoverage = computeOperationCoverage(operationsMap, coveredNodeNames, nodeMap);
    report.coverageByOperation = opCoverage;
    report.coverageByFlow = computeFlowCoverage(operationsMap, opCoverage);
  }

  return report;
}
