import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import {
  computeDashboardStats,
  getActiveRun,
  computeHealthStatus,
} from "@/lib/dashboard/stats";
import { getIndexingQueue } from "@/lib/queue/queues";
import type { MapNode, MapEdge } from "@/components/dashboard/map-types";

interface DashboardPageProps {
  searchParams: Promise<{ project?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const workspaceId = (session as { workspaceId?: string }).workspaceId;
  if (!workspaceId) redirect("/login");

  const { project: selectedProjectId } = await searchParams;

  const projects = await prisma.project.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { testRuns: true, testCases: true } },
    },
  });

  // Select project from query param or default to first
  const activeProject = selectedProjectId
    ? projects.find((p) => p.id === selectedProjectId) ?? projects[0]
    : projects[0];

  let recentRuns: Awaited<ReturnType<typeof prisma.testRun.findMany>> = [];
  let stats = {
    passRate: 0,
    flakyCount: 0,
    coverage: 0,
    lastDuration: 0,
    trends: { passRate: 0, flakyCount: 0, coverage: 0, duration: 0 },
    sparklines: {
      passRate: [] as number[],
      flakyCount: [] as number[],
      coverage: [] as number[],
      duration: [] as number[],
    },
  };
  let activeRun = null;
  let healthStatus: "healthy" | "degraded" | "failing" = "healthy";

  if (activeProject) {
    const [runs, computedStats, foundActiveRun] = await Promise.all([
      prisma.testRun.findMany({
        where: { projectId: activeProject.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      computeDashboardStats(activeProject.id),
      getActiveRun(activeProject.id),
    ]);

    recentRuns = runs;
    stats = computedStats;
    activeRun = foundActiveRun;
    healthStatus = computeHealthStatus(
      runs.map((r) => ({
        passed: r.passed,
        failed: r.failed,
        flaky: r.flaky,
        totalTests: r.totalTests,
      }))
    );
  }

  // Fetch indexing status for IndexingStatus component
  let indexingInfo = {
    lastIndexedAt: null as string | null,
    nodeCount: 0,
    edgeCount: 0,
    isIndexing: false,
  };

  // Fetch system map data for inline preview
  let mapNodes: MapNode[] = [];
  let mapEdges: MapEdge[] = [];

  if (activeProject) {
    const [dbNodes, dbEdges] = await Promise.all([
      prisma.systemMapNode.findMany({
        where: { projectId: activeProject.id },
        select: { id: true, type: true, name: true, filePath: true, metadata: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.systemMapEdge.findMany({
        where: { projectId: activeProject.id },
        select: { id: true, sourceNodeId: true, targetNodeId: true, relationship: true },
      }),
    ]);

    mapNodes = dbNodes.map((n) => ({
      id: n.id,
      type: n.type as MapNode["type"],
      name: n.name,
      filePath: n.filePath,
      metadata: n.metadata as Record<string, unknown> | null,
    }));

    mapEdges = dbEdges.map((e) => ({
      id: e.id,
      sourceId: e.sourceNodeId,
      targetId: e.targetNodeId,
      relationship: e.relationship,
    }));

    // Check if indexing is in progress via the queue
    let isIndexing = false;
    try {
      const queue = getIndexingQueue();
      const activeJobs = await queue.getActive();
      const waitingJobs = await queue.getWaiting();
      isIndexing = [...activeJobs, ...waitingJobs].some(
        (job) => job.data.projectId === activeProject.id
      );
    } catch {
      // Queue not available — default to false
    }

    indexingInfo = {
      lastIndexedAt: activeProject.lastIndexedAt?.toISOString() ?? null,
      nodeCount: dbNodes.length,
      edgeCount: dbEdges.length,
      isIndexing,
    };
  }

  return (
    <DashboardClient
      projects={projects}
      activeProject={activeProject ?? null}
      recentRuns={recentRuns}
      stats={stats}
      activeRun={activeRun}
      mapNodes={mapNodes}
      mapEdges={mapEdges}
      indexingInfo={indexingInfo}
    />
  );
}
