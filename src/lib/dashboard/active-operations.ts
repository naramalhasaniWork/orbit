import { prisma } from "@/lib/db";

export interface ActiveOperation {
  id: string;
  type: "run" | "indexing";
  status: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  label: string;
  progress: number | null;
  startedAt: string | null;
  meta: Record<string, unknown>;
}

/** How long a run can sit in each status before we consider it dead */
const STALE_THRESHOLDS_MS: Record<string, number> = {
  queued: 10 * 60 * 1000,      // 10 min — should start within seconds
  indexing: 30 * 60 * 1000,    // 30 min
  planning: 20 * 60 * 1000,    // 20 min
  executing: 60 * 60 * 1000,   // 60 min
  reporting: 15 * 60 * 1000,   // 15 min
};

/**
 * Get active operations and clean up stale runs in one pass.
 */
export async function getActiveOperations(
  workspaceId: string
): Promise<ActiveOperation[]> {
  const now = Date.now();

  // Fetch all non-terminal runs
  const allPending = await prisma.testRun.findMany({
    where: {
      project: { workspaceId },
      status: { in: ["queued", "indexing", "planning", "executing", "reporting"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      trigger: true,
      mode: true,
      totalTests: true,
      passed: true,
      failed: true,
      startedAt: true,
      createdAt: true,
      project: {
        select: { id: true, name: true, slug: true },
      },
    },
  });

  // Split into alive vs stale
  const alive: typeof allPending = [];
  const staleIds: string[] = [];

  for (const run of allPending) {
    const threshold = STALE_THRESHOLDS_MS[run.status] ?? 60 * 60 * 1000;
    const age = now - run.createdAt.getTime();

    if (age > threshold) {
      staleIds.push(run.id);
    } else {
      alive.push(run);
    }
  }

  // Auto-fail stale runs in the background
  if (staleIds.length > 0) {
    prisma.testRun
      .updateMany({
        where: { id: { in: staleIds } },
        data: { status: "failed", completedAt: new Date() },
      })
      .catch((err) => console.error("[active-ops] Failed to clean stale runs:", err));
  }

  // Build operations from alive runs only (cap at 5)
  const operations: ActiveOperation[] = alive.slice(0, 5).map((run) => ({
    id: run.id,
    type: "run" as const,
    status: run.status,
    projectId: run.project.id,
    projectName: run.project.name,
    projectSlug: run.project.slug,
    label: runStatusLabel(run.status),
    progress: computeRunProgress(run),
    startedAt: (run.startedAt ?? run.createdAt).toISOString(),
    meta: {
      trigger: run.trigger,
      mode: run.mode,
      passed: run.passed,
      failed: run.failed,
      totalTests: run.totalTests,
    },
  }));

  // Active indexing — only very recent projects without index data
  const fiveMinAgo = new Date(now - 5 * 60 * 1000);
  const indexingProjects = await prisma.project.findMany({
    where: {
      workspaceId,
      status: "active",
      lastIndexedAt: null,
      systemMapNodes: { none: {} },
      createdAt: { gte: fiveMinAgo },
    },
    select: { id: true, name: true, slug: true, createdAt: true },
  });

  for (const proj of indexingProjects) {
    operations.push({
      id: `indexing-${proj.id}`,
      type: "indexing",
      status: "indexing",
      projectId: proj.id,
      projectName: proj.name,
      projectSlug: proj.slug,
      label: "Indexing repository",
      progress: null,
      startedAt: proj.createdAt.toISOString(),
      meta: {},
    });
  }

  return operations;
}

function runStatusLabel(status: string): string {
  switch (status) {
    case "queued": return "Queued";
    case "indexing": return "Indexing repository";
    case "planning": return "Generating test plan";
    case "executing": return "Executing tests";
    case "reporting": return "Generating report";
    default: return status;
  }
}

function computeRunProgress(run: {
  status: string;
  totalTests: number;
  passed: number;
  failed: number;
}): number | null {
  switch (run.status) {
    case "queued": return 0;
    case "indexing": return 10;
    case "planning": return 25;
    case "executing":
      if (run.totalTests === 0) return 50;
      return Math.round(((run.passed + run.failed) / run.totalTests) * 100);
    case "reporting": return 90;
    default: return null;
  }
}
