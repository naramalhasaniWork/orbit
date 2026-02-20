import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";

// ============================================================
// GET /api/projects/[projectId]/export — Export test plan as JSON
// ============================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: {
        id: true,
        name: true,
        slug: true,
        framework: true,
        repoUrl: true,
        config: true,
      },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    // Get active test plan with test cases
    const testPlan = await prisma.testPlan.findFirst({
      where: { projectId, isActive: true },
      include: {
        testCases: {
          select: {
            name: true,
            type: true,
            journey: true,
            priorityScore: true,
            criticality: true,
            risk: true,
            coverageGap: true,
            steps: true,
            rationale: true,
            edgeCases: true,
            isEnabled: true,
            isCritical: true,
          },
        },
      },
      orderBy: { version: "desc" },
    });

    if (!testPlan) {
      return apiError("No active test plan found", "NOT_FOUND", 404);
    }

    // Build the export document
    const exportData = {
      _format: "orbit-test-plan-v1",
      _exportedAt: new Date().toISOString(),
      project: {
        name: project.name,
        slug: project.slug,
        framework: project.framework,
        repoUrl: project.repoUrl,
      },
      config: project.config,
      testPlan: {
        version: testPlan.version,
        summary: testPlan.summary,
        testCases: testPlan.testCases.map((tc) => ({
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
        })),
      },
    };

    return apiSuccess(exportData);
  } catch (error) {
    return handleApiError(error);
  }
}
