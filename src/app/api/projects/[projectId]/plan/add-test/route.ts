import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import { requirePermission } from "@/lib/auth/rbac";

// ============================================================
// POST /api/projects/[projectId]/plan/add-test
// Add a new test case to the active plan
// ============================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    await requirePermission(workspaceId, "plans.update");
    const { projectId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const body = await request.json();
    const {
      planId,
      name,
      type,
      journey,
      steps,
      rationale,
      edgeCases,
      isCritical,
      priorityScore,
    } = body as {
      planId?: string;
      name: string;
      type: string;
      journey?: string;
      steps?: string[];
      rationale?: string;
      edgeCases?: string[];
      isCritical?: boolean;
      priorityScore?: number;
    };

    if (!name || !type) {
      return apiError("name and type are required", "VALIDATION_ERROR", 400);
    }

    const validTypes = new Set([
      "journey",
      "api_contract",
      "auth",
      "form_validation",
      "edge_case",
      "regression",
    ]);

    if (!validTypes.has(type)) {
      return apiError(
        `Invalid type. Must be one of: ${Array.from(validTypes).join(", ")}`,
        "VALIDATION_ERROR",
        400
      );
    }

    // Find the target plan
    let targetPlanId = planId;
    if (!targetPlanId) {
      const activePlan = await prisma.testPlan.findFirst({
        where: { projectId, isActive: true },
        select: { id: true },
      });

      if (!activePlan) {
        return apiError(
          "No active test plan found. Generate a plan first.",
          "NOT_FOUND",
          404
        );
      }
      targetPlanId = activePlan.id;
    }

    const testCase = await prisma.testCase.create({
      data: {
        projectId,
        testPlanId: targetPlanId,
        name: name.trim(),
        type: type as "journey" | "api_contract" | "auth" | "form_validation" | "edge_case" | "regression",
        journey: journey?.trim() ?? null,
        steps: steps ?? [],
        rationale: rationale?.trim() ?? null,
        edgeCases: edgeCases ?? [],
        isCritical: isCritical ?? false,
        isEnabled: true,
        priorityScore: priorityScore ?? 50,
        criticality: isCritical ? 80 : 50,
        risk: 50,
        coverageGap: 50,
      },
    });

    return apiSuccess(
      {
        testCase: {
          id: testCase.id,
          name: testCase.name,
          type: testCase.type,
          journey: testCase.journey,
          priorityScore: testCase.priorityScore,
          isCritical: testCase.isCritical,
          isEnabled: testCase.isEnabled,
        },
        planId: targetPlanId,
      },
      201
    );
  } catch (error) {
    return handleApiError(error);
  }
}
