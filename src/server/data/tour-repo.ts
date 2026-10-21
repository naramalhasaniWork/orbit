import type { WorkspaceScope } from "./scope";
import { defaultDb, type Db } from "./db";
import type { TourContext } from "@/lib/onboarding/tour";

/** When the user finished or skipped the dashboard tour; null while it is still to come. */
export async function getTourCompletedAt(userId: string, db: Db = defaultDb): Promise<Date | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { onboardingTourCompletedAt: true } });
  return user?.onboardingTourCompletedAt ?? null;
}

/** Marks the tour done (a date) or due again (null, for "Replay tour"). */
export async function setTourCompletedAt(userId: string, at: Date | null, db: Db = defaultDb): Promise<Date | null> {
  const user = await db.user.update({
    where: { id: userId },
    data: { onboardingTourCompletedAt: at },
    select: { onboardingTourCompletedAt: true },
  });
  return user.onboardingTourCompletedAt;
}

/**
 * What the tour talks about: the project's latest run, its map size and whether GitHub is
 * connected. Every stop's copy comes from these real rows; nothing is invented.
 */
export async function loadTourContext(
  ws: WorkspaceScope,
  projectId: string | null,
  githubConnected: boolean
): Promise<TourContext | null> {
  const project = projectId
    ? await ws.findProject(projectId)
    : await ws.project.findFirst({ orderBy: { updatedAt: "desc" }, select: { id: true } }).then((p) => (p ? ws.findProject(p.id) : null));
  if (!project) return null;

  const [row, run, nodeCount] = await Promise.all([
    ws.project.findUnique({ where: { id: project.id }, select: { name: true } }),
    project.testRun.findFirst({
      where: { status: { in: ["completed", "failed"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, sequenceNumber: true, totalTests: true, passed: true, failed: true },
    }),
    project.systemMapNode.count(),
  ]);

  return {
    projectId: project.id,
    projectName: row?.name ?? "",
    run: run
      ? { id: run.id, number: run.sequenceNumber, total: run.totalTests, passed: run.passed, failed: run.failed }
      : null,
    nodeCount,
    githubConnected,
  };
}
