import { prisma } from "@/lib/db";
import type { SystemMapNode as PrismaNode, TestCase as PrismaTestCase } from "@/generated/prisma/client";

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

export interface CoverageReport {
  totalNodes: number;
  coveredNodes: number;
  overallPercentage: number;
  untestedRoutes: NodeCoverage[];
  untestedEndpoints: NodeCoverage[];
  untestedComponents: NodeCoverage[];
  coverageByJourney: JourneyCoverage[];
  coverageByType: Record<string, { total: number; covered: number; percentage: number }>;
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

export async function analyzeCoverage(projectId: string): Promise<CoverageReport> {
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

  // Build set of "covered" node names using a multi-signal approach:
  //  1. Journey match — test case's journey field matches the node's file path / name
  //  2. Name match — test case name includes the full node name (min 5 chars to avoid
  //     short tokens like "id", "new", "list" matching everything)
  // We intentionally do NOT use the reverse direction (nodeNameLower includes tcNameLower)
  // as it caused severe inflation: a test called "Login" would cover all 10 login-related
  // nodes, making coverage appear 10x higher than it actually is.
  const coveredNodeNames = new Set<string>();
  for (const tc of existingTestCases) {
    const tcNameLower = tc.name.toLowerCase();
    const tcJourney = tc.journey?.toLowerCase() ?? "";

    for (const node of nodes) {
      const nodeNameLower = node.name.toLowerCase();
      const nodePathLower = node.filePath.toLowerCase();

      // Signal 1: journey field matches a path segment in the node
      const journeyMatch =
        tcJourney.length >= 3 &&
        (nodeNameLower.includes(tcJourney) || nodePathLower.includes(tcJourney));

      // Signal 2: test case name contains the full node name (with length guard)
      const nameMatch =
        nodeNameLower.length >= MIN_NODE_NAME_MATCH_LENGTH &&
        tcNameLower.includes(nodeNameLower);

      if (journeyMatch || nameMatch) {
        coveredNodeNames.add(node.name);
      }
    }
  }

  const allCoverage = nodes.map((n) => buildNodeCoverage(n, coveredNodeNames));
  const untested = allCoverage.filter((c) => !c.isCovered);

  const coveredCount = allCoverage.filter((c) => c.isCovered).length;
  const overallPercentage = nodes.length > 0
    ? Math.round((coveredCount / nodes.length) * 100)
    : 0;

  return {
    totalNodes: nodes.length,
    coveredNodes: coveredCount,
    overallPercentage,
    untestedRoutes: untested.filter((c) => c.nodeType === "route"),
    untestedEndpoints: untested.filter((c) => c.nodeType === "endpoint"),
    untestedComponents: untested.filter((c) => c.nodeType === "component"),
    coverageByJourney: computeJourneyCoverage(existingTestCases, nodes, coveredNodeNames),
    coverageByType: computeTypeCoverage(nodes, coveredNodeNames),
  };
}
