import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ProjectDetailClient } from "@/components/projects/project-detail-client";
import type { MapNode, MapEdge } from "@/components/dashboard/map-types";

interface ProjectDetailPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const workspaceId = (session as { workspaceId?: string }).workspaceId;
  if (!workspaceId) redirect("/login");

  const { projectId } = await params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    include: {
      _count: {
        select: {
          testRuns: true,
          testCases: true,
          systemMapNodes: true,
          systemMapEdges: true,
        },
      },
    },
  });

  if (!project) notFound();

  // Fetch recent runs for the timeline
  const recentRuns = await prisma.testRun.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      status: true,
      mode: true,
      trigger: true,
      totalTests: true,
      passed: true,
      failed: true,
      flaky: true,
      durationMs: true,
      createdAt: true,
    },
  });

  // Fetch system map nodes for the preview
  const [mapNodes, mapEdges] = await Promise.all([
    prisma.systemMapNode.findMany({
      where: { projectId },
      select: { id: true, type: true, name: true, filePath: true, metadata: true },
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
    prisma.systemMapEdge.findMany({
      where: { projectId },
      select: { id: true, sourceNodeId: true, targetNodeId: true, relationship: true },
      take: 500,
    }),
  ]);

  const nodes: MapNode[] = mapNodes.map((n) => ({
    id: n.id,
    type: n.type as MapNode["type"],
    name: n.name,
    filePath: n.filePath,
    metadata: n.metadata as Record<string, unknown> | null,
  }));

  const edges: MapEdge[] = mapEdges.map((e) => ({
    id: e.id,
    sourceId: e.sourceNodeId,
    targetId: e.targetNodeId,
    relationship: e.relationship,
  }));

  return (
    <ProjectDetailClient
      project={{
        id: project.id,
        name: project.name,
        slug: project.slug,
        repoUrl: project.repoUrl,
        repoOwner: project.repoOwner,
        repoName: project.repoName,
        defaultBranch: project.defaultBranch,
        framework: project.framework,
        healthStatus: project.healthStatus,
        lastIndexedAt: project.lastIndexedAt,
        lastRunAt: project.lastRunAt,
        onboardingCompleted: project.onboardingCompleted,
        createdAt: project.createdAt,
        nodeCount: project._count.systemMapNodes,
        edgeCount: project._count.systemMapEdges,
        testCaseCount: project._count.testCases,
        testRunCount: project._count.testRuns,
      }}
      recentRuns={recentRuns}
      mapNodes={nodes}
      mapEdges={edges}
    />
  );
}
