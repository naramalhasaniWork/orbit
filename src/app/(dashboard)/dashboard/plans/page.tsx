import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PlansClient } from "@/components/plans/plans-client";

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

  const [plans, mapNodes, testCases] = await Promise.all([
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
    prisma.testCase.findMany({
      where: { projectId: project.id, isEnabled: true },
      select: { journey: true },
    }),
  ]);

  // Compute coverage per node
  const journeyCounts = new Map<string, number>();
  for (const tc of testCases) {
    if (tc.journey) {
      journeyCounts.set(tc.journey, (journeyCounts.get(tc.journey) ?? 0) + 1);
    }
  }

  const coverageNodes: RouteNodeCoverage[] = mapNodes.map((node) => {
    const count = journeyCounts.get(node.name) ?? journeyCounts.get(node.filePath) ?? 0;
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
    />
  );
}
