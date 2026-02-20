import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { BaselineType } from "@/generated/prisma/enums";
import { createHash } from "crypto";

// ============================================================
// Baseline Snapshot Service
// After successful runs, store UI screenshots + API response
// shapes for regression comparison
// ============================================================

interface CreateSnapshotInput {
  projectId: string;
  testRunId: string;
  type: BaselineType;
  routePath?: string;
  endpoint?: string;
  storageKey: string;
  content?: Buffer | string;
  metadata?: Record<string, unknown>;
}

interface SnapshotComparison {
  snapshotId: string;
  routePath: string | null;
  endpoint: string | null;
  type: string;
  changed: boolean;
  previousChecksum: string | null;
  currentChecksum: string;
}

/**
 * Store a baseline snapshot after a successful run.
 */
export async function createSnapshot(input: CreateSnapshotInput): Promise<string> {
  const checksum = input.content
    ? createHash("sha256").update(input.content).digest("hex")
    : null;

  const snapshot = await prisma.baselineSnapshot.create({
    data: {
      projectId: input.projectId,
      testRunId: input.testRunId,
      type: input.type,
      routePath: input.routePath ?? null,
      endpoint: input.endpoint ?? null,
      storageKey: input.storageKey,
      checksum,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });

  return snapshot.id;
}

/**
 * Get the latest baseline snapshot for a given route or endpoint.
 */
export async function getLatestBaseline(
  projectId: string,
  type: BaselineType,
  routeOrEndpoint: string
): Promise<{ id: string; storageKey: string; checksum: string | null } | null> {
  const snapshot = await prisma.baselineSnapshot.findFirst({
    where: {
      projectId,
      type,
      OR: [
        { routePath: routeOrEndpoint },
        { endpoint: routeOrEndpoint },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, storageKey: true, checksum: true },
  });

  return snapshot;
}

/**
 * Compare current run's snapshots against the baseline.
 * Returns a list of changes detected.
 */
export async function compareWithBaseline(
  projectId: string,
  currentRunId: string
): Promise<SnapshotComparison[]> {
  const currentSnapshots = await prisma.baselineSnapshot.findMany({
    where: { projectId, testRunId: currentRunId },
  });

  const comparisons: SnapshotComparison[] = [];

  for (const current of currentSnapshots) {
    const baseline = await prisma.baselineSnapshot.findFirst({
      where: {
        projectId,
        type: current.type,
        testRunId: { not: currentRunId },
        OR: [
          ...(current.routePath ? [{ routePath: current.routePath }] : []),
          ...(current.endpoint ? [{ endpoint: current.endpoint }] : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      select: { checksum: true },
    });

    const changed = baseline
      ? baseline.checksum !== current.checksum
      : false;

    comparisons.push({
      snapshotId: current.id,
      routePath: current.routePath,
      endpoint: current.endpoint,
      type: current.type,
      changed,
      previousChecksum: baseline?.checksum ?? null,
      currentChecksum: current.checksum ?? "",
    });
  }

  return comparisons;
}

/**
 * Get all baseline snapshots for a project, grouped by type.
 */
export async function getProjectBaselines(
  projectId: string,
  options?: { type?: string; limit?: number }
) {
  const where: Record<string, unknown> = { projectId };
  if (options?.type) where.type = options.type;

  return prisma.baselineSnapshot.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 50,
    select: {
      id: true,
      type: true,
      routePath: true,
      endpoint: true,
      storageKey: true,
      checksum: true,
      createdAt: true,
    },
  });
}

/**
 * Delete old baselines, keeping only the latest N per route/endpoint.
 */
export async function pruneBaselines(
  projectId: string,
  keepCount = 3
): Promise<number> {
  const groups = await prisma.baselineSnapshot.groupBy({
    by: ["routePath", "endpoint", "type"],
    where: { projectId },
    _count: { id: true },
  });

  let deleted = 0;

  for (const group of groups) {
    if (group._count.id <= keepCount) continue;

    const snapshots = await prisma.baselineSnapshot.findMany({
      where: {
        projectId,
        routePath: group.routePath,
        endpoint: group.endpoint,
        type: group.type,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    const toDelete = snapshots.slice(keepCount).map((s) => s.id);
    if (toDelete.length > 0) {
      await prisma.baselineSnapshot.deleteMany({
        where: { id: { in: toDelete } },
      });
      deleted += toDelete.length;
    }
  }

  return deleted;
}
