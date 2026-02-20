import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";

// ============================================================
// POST /api/projects/[projectId]/plan/approve
// Approve a test plan for execution (human-in-loop workflow)
// ============================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { session, workspaceId } = await requireWorkspace();
    const { projectId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true, config: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const body = await request.json();
    const { planId, action, notes } = body as {
      planId: string;
      action: "approve" | "reject";
      notes?: string;
    };

    if (!planId || !action) {
      return apiError("planId and action are required", "VALIDATION_ERROR", 400);
    }

    if (action !== "approve" && action !== "reject") {
      return apiError("action must be 'approve' or 'reject'", "VALIDATION_ERROR", 400);
    }

    const plan = await prisma.testPlan.findFirst({
      where: { id: planId, projectId },
      select: { id: true, isActive: true, summary: true },
    });

    if (!plan) {
      return apiError("Test plan not found", "NOT_FOUND", 404);
    }

    // Update plan summary with approval status
    const currentSummary = (plan.summary as Record<string, unknown>) ?? {};
    const approvalInfo = {
      status: action === "approve" ? "approved" : "rejected",
      approvedBy: session.user?.email ?? "unknown",
      approvedAt: new Date().toISOString(),
      notes: notes ?? null,
    };

    await prisma.testPlan.update({
      where: { id: planId },
      data: {
        summary: { ...currentSummary, approval: approvalInfo },
        isActive: action === "approve" ? true : plan.isActive,
      },
    });

    // Log the approval action
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: session.user.id,
        action: action === "approve" ? "plan.approved" : "plan.rejected",
        resourceType: "test_plan",
        resourceId: planId,
        metadata: { projectId, notes: notes ?? null },
      },
    });

    return apiSuccess({
      planId,
      action,
      approval: approvalInfo,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
