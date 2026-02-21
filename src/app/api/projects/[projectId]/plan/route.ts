import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";

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
  stream?: boolean;
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;

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
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;

    const project = await validateProjectAccess(projectId, workspaceId);
    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const body = (await request.json()) as PlanRequestBody;

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

    // Stream mode: return SSE with phase progress
    if (body.stream) {
      return streamPlanGeneration(projectId, body);
    }

    // Legacy non-streaming mode
    const { generatePlan } = await getPlannerService();
    const result = await generatePlan({
      projectId,
      mode: body.mode,
      focusAreas: body.focusAreas,
      excludePaths: body.excludePaths,
      maxTestCases: body.maxTestCases,
    });

    return apiSuccess(
      {
        plan: {
          id: result.plan.id,
          projectId: result.plan.projectId,
          version: result.plan.version,
          isActive: result.plan.isActive,
          summary: result.plan.summary,
          createdAt: result.plan.createdAt,
        },
        testCasesCount: result.testCases.length,
        coverage: {
          overallPercentage: result.coverage.overallPercentage,
          untestedRoutes: result.coverage.untestedRoutes.length,
          untestedEndpoints: result.coverage.untestedEndpoints.length,
        },
        journeysDetected: result.journeys.map((j) => j.name),
        tokensUsed: result.tokensUsed,
      },
      201
    );
  } catch (error) {
    return handleApiError(error);
  }
}

function streamPlanGeneration(projectId: string, body: PlanRequestBody) {
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      function emit(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      try {
        emit("plan:phase", { phase: "coverage", message: "Analyzing coverage gaps...", progress: 10 });

        const { analyzeCoverage } = await import("@/services/planning/coverage-analyzer");
        const { reconstructJourneys } = await import("@/services/planning/journey-reconstructor");

        const [coverage, journeys] = await Promise.all([
          analyzeCoverage(projectId),
          reconstructJourneys(projectId),
        ]);

        emit("plan:phase", {
          phase: "journeys",
          message: `Found ${journeys.length} user journeys, ${coverage.untestedRoutes.length} untested routes`,
          progress: 30,
        });

        emit("plan:phase", { phase: "generating", message: "Generating test cases with AI...", progress: 40 });

        const { generateTestCases } = await import("@/services/planning/test-case-generator");
        const { getNextVersion } = await import("@/services/planning/plan-cache");
        const version = await getNextVersion(projectId);

        const generationResult = await generateTestCases({
          projectId,
          version,
          mode: body.mode ?? "full",
          coverageReport: coverage,
          journeys,
          focusAreas: body.focusAreas,
          excludePaths: body.excludePaths,
          maxTestCases: body.maxTestCases,
        });

        emit("plan:phase", {
          phase: "prioritizing",
          message: `Generated ${generationResult.testCases.length} test cases, prioritizing...`,
          progress: 75,
        });

        const { prioritizeTestCases, filterByMode } = await import("@/services/planning/prioritizer");
        const prioritized = prioritizeTestCases(generationResult.testCases, coverage);
        const filtered = filterByMode(prioritized, body.mode ?? "full", body.maxTestCases);

        emit("plan:phase", { phase: "saving", message: "Saving test plan...", progress: 90 });

        const { storePlan } = await import("@/services/planning/plan-cache");
        const summary = {
          totalTests: filtered.length,
          estimatedCredits: filtered.length,
        };
        const { plan, testCases } = await storePlan(projectId, version, filtered, summary);

        emit("plan:complete", {
          planId: plan.id,
          version: plan.version,
          testCaseCount: testCases.length,
          journeyCount: journeys.length,
          coveragePercent: coverage.overallPercentage,
          progress: 100,
        });
      } catch (error) {
        console.error("Plan generation stream error:", error);
        const msg = sanitizeErrorMessage(error);
        emit("plan:error", { message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/** Sanitize error messages to avoid leaking internal details to clients. */
function sanitizeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Plan generation failed";

  // Allow known user-facing error messages through
  const safePatterns = [
    /no.*system map/i,
    /no.*test.*case/i,
    /no.*route/i,
    /project.*not.*found/i,
    /plan.*generation.*failed/i,
    /coverage.*analysis.*failed/i,
    /model.*rate.*limit/i,
    /token.*budget.*exceeded/i,
  ];

  if (safePatterns.some((p) => p.test(error.message))) {
    return error.message;
  }

  // Generic fallback for unexpected errors (DB, network, etc.)
  return "Plan generation failed. Please try again.";
}
