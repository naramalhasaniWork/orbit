import { prisma } from "@/lib/db";

// ============================================================
// Selector Memory Service
// Persists self-healed selector mappings for reuse without LLM
// ============================================================

interface SelectorMappingResult {
  id: string;
  originalSelector: string;
  healedSelector: string;
  confidence: number;
  healCount: number;
  approved: boolean;
}

/**
 * Look up a stored mapping for a broken selector.
 * Returns the highest-confidence approved mapping first,
 * then falls back to unapproved ones above the threshold.
 */
export async function lookupSelector(
  projectId: string,
  originalSelector: string,
  minConfidence = 0.85
): Promise<SelectorMappingResult | null> {
  const mapping = await prisma.selectorMapping.findFirst({
    where: {
      projectId,
      originalSelector,
      confidence: { gte: minConfidence },
    },
    orderBy: [{ approved: "desc" }, { healCount: "desc" }, { confidence: "desc" }],
  });

  if (!mapping) return null;

  return {
    id: mapping.id,
    originalSelector: mapping.originalSelector,
    healedSelector: mapping.healedSelector,
    confidence: mapping.confidence,
    healCount: mapping.healCount,
    approved: mapping.approved,
  };
}

/**
 * Store or update a selector mapping after healing.
 */
export async function storeMapping(
  projectId: string,
  originalSelector: string,
  healedSelector: string,
  confidence: number,
  testRunId?: string,
  pageUrl?: string
): Promise<string> {
  const existing = await prisma.selectorMapping.findFirst({
    where: { projectId, originalSelector, healedSelector },
  });

  let mappingId: string;

  if (existing) {
    await prisma.selectorMapping.update({
      where: { id: existing.id },
      data: {
        healCount: existing.healCount + 1,
        confidence: Math.max(existing.confidence, confidence),
      },
    });
    mappingId = existing.id;
  } else {
    const mapping = await prisma.selectorMapping.create({
      data: { projectId, originalSelector, healedSelector, confidence },
    });
    mappingId = mapping.id;
  }

  await prisma.selectorHistory.create({
    data: {
      projectId,
      selectorMappingId: mappingId,
      previousSelector: originalSelector,
      newSelector: healedSelector,
      confidence,
      testRunId,
      pageUrl,
    },
  });

  return mappingId;
}

/**
 * Approve a selector mapping so it is always preferred.
 */
export async function approveMapping(mappingId: string): Promise<void> {
  await prisma.selectorMapping.update({
    where: { id: mappingId },
    data: { approved: true },
  });
}

/**
 * Revoke approval and optionally delete a mapping.
 */
export async function revokeMapping(
  mappingId: string,
  deleteMapping = false
): Promise<void> {
  if (deleteMapping) {
    await prisma.selectorHistory.deleteMany({
      where: { selectorMappingId: mappingId },
    });
    await prisma.selectorMapping.delete({ where: { id: mappingId } });
  } else {
    await prisma.selectorMapping.update({
      where: { id: mappingId },
      data: { approved: false },
    });
  }
}

/**
 * Get all selector mappings for a project.
 */
export async function getProjectMappings(
  projectId: string,
  options?: { approvedOnly?: boolean; limit?: number }
): Promise<SelectorMappingResult[]> {
  const where: Record<string, unknown> = { projectId };
  if (options?.approvedOnly) where.approved = true;

  const mappings = await prisma.selectorMapping.findMany({
    where,
    orderBy: [{ healCount: "desc" }, { confidence: "desc" }],
    take: options?.limit ?? 100,
  });

  return mappings.map((m) => ({
    id: m.id,
    originalSelector: m.originalSelector,
    healedSelector: m.healedSelector,
    confidence: m.confidence,
    healCount: m.healCount,
    approved: m.approved,
  }));
}

/**
 * Get the healing history for a specific mapping.
 */
export async function getMappingHistory(mappingId: string) {
  return prisma.selectorHistory.findMany({
    where: { selectorMappingId: mappingId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}
