import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiKey, verifyProjectAccess } from "@/lib/auth/api-key";

// ============================================================
// GET /api/v1/projects/[projectId]/plan — Get current test plan
// ============================================================

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const auth = await requireApiKey(req);
  if (auth instanceof NextResponse) return auth;

  const { projectId } = await params;

  if (!(await verifyProjectAccess(auth.workspaceId, projectId))) {
    return NextResponse.json(
      { error: "Project not found" },
      { status: 404 }
    );
  }

  const plan = await prisma.testPlan.findFirst({
    where: { projectId, isActive: true },
    orderBy: { version: "desc" },
    include: {
      testCases: {
        where: { isEnabled: true },
        orderBy: { priorityScore: "desc" },
        select: {
          id: true,
          name: true,
          type: true,
          journey: true,
          priorityScore: true,
          criticality: true,
          risk: true,
          coverageGap: true,
          isCritical: true,
          lastVerdict: true,
          lastRunAt: true,
          rationale: true,
          edgeCases: true,
        },
      },
    },
  });

  if (!plan) {
    return NextResponse.json(
      { error: "No active test plan found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    data: {
      id: plan.id,
      projectId: plan.projectId,
      version: plan.version,
      generatedBy: plan.generatedBy,
      summary: plan.summary,
      createdAt: plan.createdAt,
      testCases: plan.testCases,
      totalTestCases: plan.testCases.length,
    },
  });
}
