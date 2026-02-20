import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";

export async function GET(
  _request: NextRequest,
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

    const flakyTests = await prisma.flakyTest.findMany({
      where: { projectId },
      include: {
        testCase: {
          select: {
            id: true,
            name: true,
            type: true,
            journey: true,
            priorityScore: true,
            isCritical: true,
          },
        },
      },
      orderBy: { occurrences: "desc" },
    });

    const quarantinedCount = flakyTests.filter((f) => f.isQuarantined).length;
    const totalOccurrences = flakyTests.reduce(
      (s, f) => s + f.occurrences,
      0
    );

    return apiSuccess({
      projectId,
      totalFlaky: flakyTests.length,
      quarantinedCount,
      totalOccurrences,
      tests: flakyTests.map((f) => ({
        id: f.id,
        testCase: f.testCase,
        occurrences: f.occurrences,
        passRate: f.passRate,
        isQuarantined: f.isQuarantined,
        lastFlakyAt: f.lastFlakyAt,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
