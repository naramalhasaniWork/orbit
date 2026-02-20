import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";

// ============================================================
// POST /api/projects/[projectId]/import — Import test plan JSON
// ============================================================

interface ImportTestCase {
  name: string;
  type: string;
  journey?: string | null;
  priorityScore?: number;
  criticality?: number;
  risk?: number;
  coverageGap?: number;
  steps: unknown;
  rationale?: string | null;
  edgeCases?: unknown;
  isEnabled?: boolean;
  isCritical?: boolean;
}

interface ImportBody {
  _format?: string;
  testPlan?: {
    testCases: ImportTestCase[];
  };
  testCases?: ImportTestCase[];
}

const VALID_TYPES = new Set([
  "journey",
  "api_contract",
  "auth",
  "form_validation",
  "edge_case",
  "regression",
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const body = (await request.json()) as ImportBody;

    // Support both formats: wrapped in testPlan or flat testCases array
    const testCases = body.testPlan?.testCases ?? body.testCases;

    if (!Array.isArray(testCases) || testCases.length === 0) {
      return apiError(
        "Import must contain a non-empty testCases array",
        "VALIDATION_ERROR",
        400
      );
    }

    if (testCases.length > 500) {
      return apiError("Maximum 500 test cases per import", "VALIDATION_ERROR", 400);
    }

    // Validate test cases
    const validatedCases: ImportTestCase[] = [];
    const errors: string[] = [];

    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      if (!tc.name || typeof tc.name !== "string") {
        errors.push(`Test case [${i}]: name is required`);
        continue;
      }
      if (!tc.steps) {
        errors.push(`Test case [${i}]: steps are required`);
        continue;
      }
      const type = typeof tc.type === "string" && VALID_TYPES.has(tc.type)
        ? tc.type
        : "journey";

      validatedCases.push({ ...tc, type });
    }

    if (validatedCases.length === 0) {
      return apiError(
        `No valid test cases found. Errors: ${errors.join("; ")}`,
        "VALIDATION_ERROR",
        400
      );
    }

    // Get or create a new plan version
    const latestPlan = await prisma.testPlan.findFirst({
      where: { projectId },
      orderBy: { version: "desc" },
      select: { version: true },
    });

    const newVersion = (latestPlan?.version ?? 0) + 1;

    // Deactivate existing plans
    await prisma.testPlan.updateMany({
      where: { projectId, isActive: true },
      data: { isActive: false },
    });

    // Create new plan
    const plan = await prisma.testPlan.create({
      data: {
        projectId,
        version: newVersion,
        isActive: true,
        generatedBy: "import",
        summary: {
          totalTests: validatedCases.length,
          importedAt: new Date().toISOString(),
          format: body._format ?? "unknown",
        },
      },
    });

    // Create test cases
    await prisma.testCase.createMany({
      data: validatedCases.map((tc) => ({
        testPlanId: plan.id,
        projectId,
        name: tc.name,
        type: tc.type as "journey" | "api_contract" | "auth" | "form_validation" | "edge_case" | "regression",
        journey: tc.journey ?? null,
        priorityScore: tc.priorityScore ?? 50,
        criticality: tc.criticality ?? 50,
        risk: tc.risk ?? 50,
        coverageGap: tc.coverageGap ?? 50,
        steps: tc.steps as object,
        rationale: tc.rationale ?? null,
        edgeCases: tc.edgeCases ?? [],
        isEnabled: tc.isEnabled ?? true,
        isCritical: tc.isCritical ?? false,
      })),
    });

    return apiSuccess(
      {
        planId: plan.id,
        version: newVersion,
        imported: validatedCases.length,
        skipped: testCases.length - validatedCases.length,
        errors: errors.length > 0 ? errors : undefined,
      },
      201
    );
  } catch (error) {
    return handleApiError(error);
  }
}
