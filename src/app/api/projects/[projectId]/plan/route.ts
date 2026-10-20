import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { enqueuePlanGeneration } from "@/services/planning/plan-jobs";
import { isProjectIndexed, INDEX_REQUIRED_MESSAGE } from "@/services/indexing/index-status";
import { route } from "@/server/http/route";

// Dynamic import: planner transitively imports prompt files containing
// markdown with backtick-escaped code examples that confuse the Next.js
// bundler during static page data collection.
async function getPlannerService() {
  return import("@/services/planning/planner");
}

interface PlanRequestBody {
  mode?: "full" | "smoke" | "regression" | "targeted";
  focusAreas?: string[];
  excludePaths?: string[];
  maxTestCases?: number;
}

const VALID_MODES = new Set(["full", "smoke", "regression", "targeted"]);

async function validateProjectAccess(projectId: string, workspaceId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true },
  });

  if (!project) {
    return null;
  }
  return project;
}

export const GET = route({}, async ({ params: { projectId }, workspaceId }) => {
  const project = await validateProjectAccess(projectId, workspaceId);
  if (!project) {
    return apiError("Project not found", "NOT_FOUND", 404);
  }

  const { getExistingPlan } = await getPlannerService();
  const cached = await getExistingPlan(projectId);
  if (!cached) {
    return apiSuccess({ plan: null, testCases: [] });
  }

  return apiSuccess({
    plan: {
      id: cached.plan.id,
      projectId: cached.plan.projectId,
      version: cached.plan.version,
      isActive: cached.plan.isActive,
      generatedBy: cached.plan.generatedBy,
      summary: cached.plan.summary,
      createdAt: cached.plan.createdAt,
    },
    testCases: cached.testCases.map((tc) => ({
      id: tc.id,
      name: tc.name,
      type: tc.type,
      journey: tc.journey,
      priorityScore: tc.priorityScore,
      criticality: tc.criticality,
      risk: tc.risk,
      coverageGap: tc.coverageGap,
      steps: tc.steps,
      rationale: tc.rationale,
      edgeCases: tc.edgeCases,
      isEnabled: tc.isEnabled,
      isCritical: tc.isCritical,
      lastVerdict: tc.lastVerdict,
    })),
  });
});

/**
 * Queues plan generation and returns 202 immediately. Generation takes
 * minutes of LLM work; progress streams from ./progress and the latest state
 * is readable from ./job, so the UI survives a reload.
 */
export const POST = route(
  { permission: "plans.create" },
  async ({ req: request, params: { projectId }, workspaceId }) => {
    const project = await validateProjectAccess(projectId, workspaceId);
    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    // Without a system map the planner has nothing to plan from
    if (!(await isProjectIndexed(projectId))) {
      return apiError(INDEX_REQUIRED_MESSAGE, "INDEX_REQUIRED", 409);
    }

    const body = (await request.json().catch(() => ({}))) as PlanRequestBody;

    if (body.mode && !VALID_MODES.has(body.mode)) {
      return apiError(
        "Invalid mode. Must be: full, smoke, regression, or targeted",
        "VALIDATION_ERROR",
        400
      );
    }

    if (body.maxTestCases !== undefined) {
      if (typeof body.maxTestCases !== "number" || body.maxTestCases < 1 || body.maxTestCases > 500) {
        return apiError("maxTestCases must be between 1 and 500", "VALIDATION_ERROR", 400);
      }
    }

    const { state, alreadyRunning } = await enqueuePlanGeneration(projectId, {
      mode: body.mode ?? "full",
      focusAreas: body.focusAreas,
      excludePaths: body.excludePaths,
      maxTestCases: body.maxTestCases,
    });

    return apiSuccess({ job: state, alreadyRunning }, 202);
  }
);
