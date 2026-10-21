import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseProjectSettings } from "@/server/data/settings-repo";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { FinishSetupCard } from "@/components/dashboard/finish-setup-card";
import { getFinishSetupSteps } from "@/lib/setup/finish-setup";
import { computeDashboardStats, getActiveRun, type DashboardStats } from "@/lib/dashboard/stats";
import { getIndexingQueue } from "@/lib/queue/queues";
import { getNeedsYou, getProjectTracks, getRiskiestUntested } from "@/lib/dashboard/home";
import { EMPTY_LAUNCHPAD, getLaunchpad } from "@/lib/dashboard/launchpad";

interface DashboardPageProps {
  searchParams: Promise<{ project?: string }>;
}

const EMPTY_STATS: DashboardStats = {
  passRate: null,
  latestRunNumber: null,
  flakyCount: 0,
  coverage: 0,
  lastDuration: 0,
  trends: { passRate: 0, flakyCount: 0, coverage: 0, duration: 0 },
  sparklines: { passRate: [], flakyCount: [], coverage: [], duration: [] },
};

/** Whether the indexing queue holds a job for this project. False when Redis is unreachable. */
async function isProjectIndexing(projectId: string): Promise<boolean> {
  try {
    const queue = getIndexingQueue();
    const [active, waiting] = await Promise.all([queue.getActive(), queue.getWaiting()]);
    return [...active, ...waiting].some((job) => job.data.projectId === projectId);
  } catch {
    return false;
  }
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const workspaceId = (session as { workspaceId?: string }).workspaceId;
  if (!workspaceId) redirect("/login");
  const userId = (session.user as { id?: string } | undefined)?.id ?? null;

  const { project: selectedProjectId } = await searchParams;

  const projects = await prisma.project.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, repoOwner: true, repoName: true, settings: true, lastIndexedAt: true },
  });
  const activeProject = projects.find((p) => p.id === selectedProjectId) ?? projects[0] ?? null;
  const pid = activeProject?.id;

  // Everything the page reads, in one parallel round.
  const [finishSetupSteps, tracks, recentRuns, stats, activeRun, needsYou, riskiest, launchpad, isIndexing] = await Promise.all([
    getFinishSetupSteps(workspaceId, (session as { role?: string }).role),
    getProjectTracks(workspaceId),
    pid
      ? prisma.testRun.findMany({
          where: { projectId: pid },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { status: true, passed: true, failed: true, flaky: true },
        })
      : [],
    pid ? computeDashboardStats(pid) : EMPTY_STATS,
    pid ? getActiveRun(pid) : null,
    pid ? getNeedsYou(pid) : [],
    pid ? getRiskiestUntested(pid) : [],
    activeProject ? getLaunchpad(activeProject, workspaceId, userId) : EMPTY_LAUNCHPAD,
    pid ? isProjectIndexing(pid) : false,
  ]);

  const settings = parseProjectSettings(activeProject?.settings);

  return (
    <>
      {finishSetupSteps && <FinishSetupCard workspaceId={workspaceId} steps={finishSetupSteps} />}
      <DashboardClient
        activeProject={activeProject ? { id: activeProject.id, name: activeProject.name } : null}
        recentRuns={recentRuns}
        stats={stats}
        activeRun={activeRun}
        indexingInfo={{
          lastIndexedAt: activeProject?.lastIndexedAt?.toISOString() ?? null,
          nodeCount: launchpad.map.nodes.length,
          edgeCount: launchpad.map.edges.length,
          isIndexing,
        }}
        syncInfo={{
          commitsBehind: settings.commitsBehind ?? 0,
          lastCommitSha: settings.lastCommitSha ?? null,
          lastCommitMessage: settings.lastCommitMessage ?? null,
          lastCommitAt: settings.lastCommitAt ?? null,
          autoSync: settings.autoSync ?? false,
          syncDiff: settings.lastSyncDiff ?? null,
        }}
        tracks={tracks}
        needsYou={needsYou}
        riskiest={riskiest}
        launchpad={launchpad}
      />
    </>
  );
}
