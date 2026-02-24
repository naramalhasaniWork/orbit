import { prisma } from "@/lib/db";

export type OperationKind = "test" | "security_audit" | "visual_test" | "indexing";

export interface ActiveOperation {
  id: string;
  type: "run" | "indexing";
  kind: OperationKind;
  status: string;
  mode: string | null;
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
  queued: 3 * 60 * 60 * 1000,  // 3 hours — queue backlog is legitimate
  indexing: 30 * 60 * 1000,    // 30 min
  planning: 20 * 60 * 1000,    // 20 min
  executing: 2 * 60 * 60 * 1000, // 2 hours — large test suites
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
      metadata: true,
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
  const operations: ActiveOperation[] = alive.slice(0, 5).map((run) => {
    const runMeta = (run.metadata && typeof run.metadata === "object" && !Array.isArray(run.metadata))
      ? run.metadata as Record<string, unknown>
      : {};
    const kind = resolveOperationKind(run.mode, runMeta);
    return {
      id: run.id,
      type: "run" as const,
      kind,
      status: run.status,
      mode: run.mode,
      projectId: run.project.id,
      projectName: run.project.name,
      projectSlug: run.project.slug,
      label: runStatusLabel(run.status, kind),
      progress: computeRunProgress(run),
      startedAt: (run.startedAt ?? run.createdAt).toISOString(),
      meta: {
        trigger: run.trigger,
        mode: run.mode,
        passed: run.passed,
        failed: run.failed,
        totalTests: run.totalTests,
      },
    };
  });

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
      kind: "indexing",
      status: "indexing",
      mode: null,
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

/** Derive the operation kind from run mode + metadata hints */
function resolveOperationKind(
  mode: string,
  metadata: Record<string, unknown>
): OperationKind {
  // Check metadata for explicit type hints
  if (metadata.type === "security_audit" || metadata.type === "audit") {
    return "security_audit";
  }
  if (metadata.type === "visual_test" || metadata.source === "visual-qa") {
    return "visual_test";
  }

  // Check focus areas for security-heavy audits
  const focusAreas = metadata.focusAreas;
  if (Array.isArray(focusAreas) && focusAreas.some(
    (a) => typeof a === "string" && a.toLowerCase().includes("security")
  )) {
    return "security_audit";
  }

  switch (mode) {
    case "full":
    case "smoke":
    case "regression":
      return "test";
    case "targeted":
      return "test";
    default:
      return "test";
  }
}

const KIND_LABELS: Record<OperationKind, Record<string, string>> = {
  test: {
    queued: "Queued",
    indexing: "Indexing repository",
    planning: "Generating test plan",
    executing: "Running tests",
    reporting: "Generating report",
  },
  security_audit: {
    queued: "Audit queued",
    indexing: "Indexing for audit",
    planning: "Analyzing security",
    executing: "Running security audit",
    reporting: "Generating audit report",
  },
  visual_test: {
    queued: "Queued",
    indexing: "Indexing repository",
    planning: "Preparing visual test",
    executing: "Running visual test",
    reporting: "Generating visual report",
  },
  indexing: {
    indexing: "Indexing repository",
  },
};

function runStatusLabel(status: string, kind: OperationKind): string {
  return KIND_LABELS[kind]?.[status] ?? KIND_LABELS.test[status] ?? status;
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
