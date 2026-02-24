import { prisma } from "@/lib/db";

export interface ActiveOperation {
  id: string;
  type: "run" | "indexing";
  status: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  /** Human-friendly label like "Indexing", "Planning", "Executing tests" */
  label: string;
  /** 0-100 progress if available */
  progress: number | null;
  /** When the operation started */
  startedAt: string | null;
  /** Additional context (trigger, mode, etc.) */
  meta: Record<string, unknown>;
}

/**
 * Get all active operations across the workspace.
 * Called server-side on layout render and via polling API.
 */
export async function getActiveOperations(
  workspaceId: string
): Promise<ActiveOperation[]> {
  const operations: ActiveOperation[] = [];

  // Only show runs created in the last 2 hours — anything older is stale/stuck
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const activeRuns = await prisma.testRun.findMany({
    where: {
      project: { workspaceId },
      status: { in: ["queued", "indexing", "planning", "executing", "reporting"] },
      createdAt: { gte: cutoff },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
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

  // Auto-fail runs older than 2 hours that are still in non-terminal status
  await prisma.testRun.updateMany({
    where: {
      project: { workspaceId },
      status: { in: ["queued", "indexing", "planning", "executing", "reporting"] },
      createdAt: { lt: cutoff },
    },
    data: {
      status: "failed",
      completedAt: new Date(),
    },
  });

  for (const run of activeRuns) {
    operations.push({
      id: run.id,
      type: "run",
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
    });
  }

  // Active indexing jobs — check for projects recently updated without lastIndexedAt
  // or with active BullMQ jobs (checked via the queue in the API route)
  const indexingProjects = await prisma.project.findMany({
    where: {
      workspaceId,
      status: "active",
      lastIndexedAt: null,
      systemMapNodes: { none: {} },
    },
    select: { id: true, name: true, slug: true, createdAt: true },
  });

  // Only include if they were created recently (likely being indexed now)
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  for (const proj of indexingProjects) {
    if (proj.createdAt > fiveMinAgo) {
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
