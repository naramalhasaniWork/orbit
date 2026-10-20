import { apiSuccess, apiError } from "@/lib/utils/api";
import { emitRunProgress } from "@/lib/websocket";
import { route } from "@/server/http/route";

const CANCELLABLE_STATUSES = new Set([
  "queued",
  "indexing",
  "planning",
  "executing",
]);

export const POST = route(
  { permission: "runs.cancel" },
  async ({ params: { projectId, runId }, db }) => {
    const project = await db.project(projectId);

    const run = await project.testRun.findUnique({
      where: { id: runId },
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

    const updated = await project.testRun.update({
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
  }
);
