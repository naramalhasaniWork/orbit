import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseProjectSettings } from "@/server/data/settings-repo";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { FinishSetupCard } from "@/components/dashboard/finish-setup-card";
import { getFinishSetupSteps } from "@/lib/setup/finish-setup";
import {
  computeDashboardStats,
  getActiveRun,
  computeHealthStatus,
} from "@/lib/dashboard/stats";
import { getIndexingQueue } from "@/lib/queue/queues";
import { getNeedsYou, getProjectTracks, getRiskiestUntested } from "@/lib/dashboard/home";

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

  // Fetch sync/diff info for the active project
  let syncInfo: {
    commitsBehind: number;
    lastCommitSha: string | null;
    lastCommitMessage: string | null;
    lastCommitAt: string | null;
    autoSync: boolean;
    syncDiff: { added: number; modified: number; removed: number } | null;
  } = { commitsBehind: 0, lastCommitSha: null, lastCommitMessage: null, lastCommitAt: null, autoSync: false, syncDiff: null };

  if (activeProject) {
    const proj = await prisma.project.findUnique({
      where: { id: activeProject.id },
      select: { settings: true },
    });
    const settings = parseProjectSettings(proj?.settings);
    syncInfo = {
      commitsBehind: settings.commitsBehind ?? 0,
      lastCommitSha: settings.lastCommitSha ?? null,
      lastCommitMessage: settings.lastCommitMessage ?? null,
      lastCommitAt: settings.lastCommitAt ?? null,
      autoSync: settings.autoSync ?? false,
      syncDiff: settings.lastSyncDiff ?? null,
    };
  }

  // Fetch indexing status for IndexingStatus component
  let indexingInfo = {
    lastIndexedAt: null as string | null,
    nodeCount: 0,
    edgeCount: 0,
    isIndexing: false,
  };

  let nodeCount = 0;
  let edgeCount = 0;
  let needsYou: Awaited<ReturnType<typeof getNeedsYou>> = [];
  let riskiest: Awaited<ReturnType<typeof getRiskiestUntested>> = [];
  const tracks = await getProjectTracks(workspaceId);

  if (activeProject) {
    [nodeCount, edgeCount, needsYou, riskiest] = await Promise.all([
      prisma.systemMapNode.count({ where: { projectId: activeProject.id } }),
      prisma.systemMapEdge.count({ where: { projectId: activeProject.id } }),
      getNeedsYou(activeProject.id),
      getRiskiestUntested(activeProject.id),
    ]);

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
      nodeCount,
      edgeCount,
      isIndexing,
    };
  }

  const finishSetupSteps = await getFinishSetupSteps(
    workspaceId,
    (session as { role?: string }).role
  );

  return (
    <>
      {finishSetupSteps && <FinishSetupCard workspaceId={workspaceId} steps={finishSetupSteps} />}
      <DashboardClient
        activeProject={activeProject ?? null}
        recentRuns={recentRuns}
        stats={stats}
        activeRun={activeRun}
        indexingInfo={indexingInfo}
        syncInfo={syncInfo}
        tracks={tracks}
        needsYou={needsYou}
        riskiest={riskiest}
      />
    </>
  );
}
