import { prisma } from "@/lib/db";
import type { SystemMapNode as PrismaNode, TestCase as PrismaTestCase } from "@/generated/prisma/client";

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

  // Build set of "covered" node names by matching test case names to node names
  const coveredNodeNames = new Set<string>();
  for (const tc of existingTestCases) {
    for (const node of nodes) {
      const tcNameLower = tc.name.toLowerCase();
      const nodeNameLower = node.name.toLowerCase();
      if (tcNameLower.includes(nodeNameLower) || nodeNameLower.includes(tcNameLower)) {
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
