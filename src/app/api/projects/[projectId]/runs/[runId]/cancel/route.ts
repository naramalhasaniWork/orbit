import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import { emitRunProgress } from "@/lib/websocket";

const CANCELLABLE_STATUSES = new Set([
  "queued",
  "indexing",
  "planning",
  "executing",
]);

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; runId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId, runId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const run = await prisma.testRun.findFirst({
      where: { id: runId, projectId },
      select: { id: true, status: true, totalTests: true, passed: true, failed: true, flaky: true },
    });

    if (!run) {
      return apiError("Test run not found", "NOT_FOUND", 404);
    }

    if (!CANCELLABLE_STATUSES.has(run.status)) {
      return apiError(
        `Cannot cancel run with status '${run.status}'`,
        "INVALID_STATUS",
        409
      );
    }

    const updated = await prisma.testRun.update({
      where: { id: runId },
      data: {
        status: "cancelled",
        completedAt: new Date(),
      },
    });

    // Emit WebSocket event for the cancellation
    await emitRunProgress(runId, {
      runId,
      status: "cancelled",
      currentTest: "",
      totalTests: run.totalTests,
      passed: run.passed,
      failed: run.failed,
      flaky: run.flaky,
    });

    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
