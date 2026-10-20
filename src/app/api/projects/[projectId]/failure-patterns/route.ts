import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/utils/api";
import {
  getFailurePatterns,
  PATTERN_CATEGORY_LABELS,
} from "@/services/reporting/failure-patterns";
import { route } from "@/server/http/route";

// ============================================================
// GET /api/projects/[projectId]/failure-patterns
// ============================================================

export const GET = route({}, async ({ req: request, params: { projectId }, workspaceId }) => {
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true },
  });

  if (!project) {
    return apiError("Project not found", "NOT_FOUND", 404);
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(
    parseInt(searchParams.get("limit") ?? "20", 10),
    50
  );

  const patterns = await getFailurePatterns(projectId, limit);

  // Aggregate by category
  const byCategory: Record<string, { count: number; occurrences: number }> = {};
  for (const p of patterns) {
    const entry = byCategory[p.category] ?? { count: 0, occurrences: 0 };
    entry.count++;
    entry.occurrences += p.occurrences;
    byCategory[p.category] = entry;
  }

  return apiSuccess({
    projectId,
    totalPatterns: patterns.length,
    patterns,
    byCategory: Object.entries(byCategory).map(([category, stats]) => ({
      category,
      label: PATTERN_CATEGORY_LABELS[category] ?? category,
      ...stats,
    })),
  });
});
