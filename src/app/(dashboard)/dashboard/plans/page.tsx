import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PlansClient } from "@/components/plans/plans-client";
import { isProjectIndexed } from "@/services/indexing/index-status";

export const dynamic = "force-dynamic";

interface RouteNodeCoverage {
  id: string;
  name: string;
  type: string;
  filePath: string;
  coverageStatus: "covered" | "partial" | "none";
  testCount: number;
}

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const workspaceId = (session as { workspaceId?: string }).workspaceId;
  if (!workspaceId) redirect("/login");

  const params = await searchParams;

  // Respect the ?project= query param, fall back to first project
  let project: { id: string; name: string } | null = null;

  if (params.project) {
    project = await prisma.project.findFirst({
      where: { id: params.project, workspaceId },
      select: { id: true, name: true },
    });
  }

  if (!project) {
    project = await prisma.project.findFirst({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true },
    });
  }

  if (!project) {
    return (
      <PlansClient projectId={null} projectName={null} plans={[]} coverageNodes={[]} />
    );
  }

  const [plans, mapNodes, activePlanTestCases] = await Promise.all([
    prisma.testPlan.findMany({
      where: { projectId: project.id, deletedAt: null },
      orderBy: { version: "desc" },
      include: {
        testCases: {
          orderBy: [{ journey: "asc" }, { priorityScore: "desc" }],
        },
      },
    }),
    prisma.systemMapNode.findMany({
      where: { projectId: project.id, type: { in: ["route", "endpoint"] } },
      select: { id: true, name: true, type: true, filePath: true },
      orderBy: { name: "asc" },
    }),
    // Fetch name + journey from the active plan — used for multi-signal coverage matching
    prisma.testCase.findMany({
      where: {
        projectId: project.id,
        isEnabled: true,
        testPlan: { isActive: true },
      },
      select: { name: true, journey: true },
    }),
  ]);

  // Multi-signal coverage matching (mirrors coverage-analyzer.ts logic):
  //  Signal 1 — journey label appears as substring in node name or file path
  //  Signal 2 — test case name contains the full node name (min 5 chars)
  // Count how many test cases cover each node so the map shows partial vs full coverage.
  const MIN_MATCH_LEN = 5;
  const nodeCoverageCount = new Map<string, number>(); // nodeId → match count

  for (const node of mapNodes) {
    const nodeNameLower = node.name.toLowerCase();
    const nodePathLower = node.filePath.toLowerCase();
    let count = 0;

    for (const tc of activePlanTestCases) {
      const tcNameLower = tc.name.toLowerCase();
      const tcJourney = tc.journey?.toLowerCase() ?? "";

      const journeyMatch =
        tcJourney.length >= 3 &&
        (nodeNameLower.includes(tcJourney) || nodePathLower.includes(tcJourney));

      const nameMatch =
        nodeNameLower.length >= MIN_MATCH_LEN &&
        tcNameLower.includes(nodeNameLower);

      if (journeyMatch || nameMatch) count++;
    }
    nodeCoverageCount.set(node.id, count);
  }

  const coverageNodes: RouteNodeCoverage[] = mapNodes.map((node) => {
    const count = nodeCoverageCount.get(node.id) ?? 0;
    return {
      id: node.id,
      name: node.name,
      type: node.type,
      filePath: node.filePath,
      coverageStatus: count >= 2 ? "covered" : count === 1 ? "partial" : "none",
      testCount: count,
    };
  });

  const serializedPlans = plans.map((plan) => ({
    id: plan.id,
    version: plan.version,
    isActive: plan.isActive,
    generatedBy: plan.generatedBy,
    summary: plan.summary,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    testCases: plan.testCases.map((tc) => ({
      id: tc.id,
      name: tc.name,
      type: tc.type,
      journey: tc.journey,
      priorityScore: tc.priorityScore,
      criticality: tc.criticality,
      risk: tc.risk,
      coverageGap: tc.coverageGap,
      steps: tc.steps,
      rationale: tc.rationale,
      edgeCases: tc.edgeCases,
      isEnabled: tc.isEnabled,
      isCritical: tc.isCritical,
      lastVerdict: tc.lastVerdict,
    })),
  }));

  return (
    <PlansClient
      projectId={project.id}
      projectName={project.name}
      plans={serializedPlans}
      coverageNodes={coverageNodes}
      isIndexed={await isProjectIndexed(project.id)}
    />
  );
}
