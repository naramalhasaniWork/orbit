import { prisma } from "@/lib/db";
import { createHash } from "crypto";
import type { BaselineSnapshot } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";

// ============================================================
// Types
// ============================================================

interface BaselineCreateInput {
  projectId: string;
  testRunId: string;
  routePath: string;
  storageKey: string;
  checksum: string;
  metadata?: Record<string, unknown>;
}

// ============================================================
// Baseline CRUD
// ============================================================

/**
 * Get the latest screenshot baseline for a project + route.
 */
export async function getBaseline(
  projectId: string,
  routePath: string,
  type: "screenshot" = "screenshot"
): Promise<BaselineSnapshot | null> {
  return prisma.baselineSnapshot.findFirst({
    where: {
      projectId,
      routePath,
      type,
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Create a new baseline snapshot.
 */
export async function setBaseline(
  input: BaselineCreateInput
): Promise<BaselineSnapshot> {
  return prisma.baselineSnapshot.create({
    data: {
      projectId: input.projectId,
      testRunId: input.testRunId,
      type: "screenshot",
      routePath: input.routePath,
      storageKey: input.storageKey,
      checksum: input.checksum,
      metadata: JSON.parse(JSON.stringify(input.metadata ?? {})) as Prisma.InputJsonValue,
    },
  });
}

/**
 * Update an existing baseline with a new screenshot.
 */
export async function updateBaseline(
  id: string,
  storageKey: string,
  checksum: string
): Promise<BaselineSnapshot> {
  return prisma.baselineSnapshot.update({
    where: { id },
    data: { storageKey, checksum },
  });
}

/**
 * List all screenshot baselines for a project.
 */
export async function listBaselines(
  projectId: string
): Promise<BaselineSnapshot[]> {
  // Get latest baseline per route by fetching all and deduplicating
  const all = await prisma.baselineSnapshot.findMany({
    where: { projectId, type: "screenshot" },
    orderBy: { createdAt: "desc" },
  });

  // Deduplicate: keep only the latest per routePath
  const seen = new Set<string>();
  const unique: BaselineSnapshot[] = [];

  for (const baseline of all) {
    const key = baseline.routePath ?? "__no_route__";
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(baseline);
    }
  }

  return unique;
}

/**
 * Delete a specific baseline.
 */
export async function deleteBaseline(id: string): Promise<void> {
  await prisma.baselineSnapshot.delete({ where: { id } });
}

/**
 * Compute a checksum from raw image data.
 */
export function computeChecksum(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Accept a current screenshot as the new baseline for a route.
 * Replaces the existing baseline if one exists.
 */
export async function acceptAsBaseline(
  projectId: string,
  testRunId: string,
  routePath: string,
  storageKey: string,
  checksum: string
): Promise<BaselineSnapshot> {
  const existing = await getBaseline(projectId, routePath);

  if (existing) {
    return updateBaseline(existing.id, storageKey, checksum);
  }

  return setBaseline({
    projectId,
    testRunId,
    routePath,
    storageKey,
    checksum,
  });
}
