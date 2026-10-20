import { prisma } from "@/lib/db";
import type { ExecutionMode, TestVerdict } from "@/generated/prisma/enums";

// Persists one test case's result for a run, with retries. Shared by the
// sequential runner and the parallel executor so every executed case is
// recorded (and billed — see chargeRunCredits).

/** How the result was produced, for the replay share and model-cost metrics. */
export interface ExecutionMeta {
  executionMode: ExecutionMode;
  modelCalls: number;
  modelCostUsd: number;
  divergedAtStep?: number | null;
}

const SAVE_RESULT_MAX_RETRIES = 3;
const SAVE_RESULT_BASE_DELAY_MS = 500;

export async function saveTestResult(
  runId: string, testCaseId: string, verdict: TestVerdict, durationMs: number,
  steps: Array<Record<string, unknown>>, artifacts: Record<string, string>, healedSelectors: string[],
  execution?: ExecutionMeta
): Promise<void> {
  const data = {
    testRunId: runId, testCaseId, verdict, durationMs,
    steps: JSON.parse(JSON.stringify(steps)),
    artifacts: JSON.parse(JSON.stringify(artifacts)),
    healedSelectors: JSON.parse(JSON.stringify(healedSelectors)),
    ...execution,
  };

  for (let attempt = 1; attempt <= SAVE_RESULT_MAX_RETRIES; attempt++) {
    try {
      // Upsert on (run, case): a retried job rewrites its result instead of duplicating it
      await prisma.testResult.upsert({
        where: { testRunId_testCaseId: { testRunId: runId, testCaseId } },
        create: data,
        update: data,
      });
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < SAVE_RESULT_MAX_RETRIES) {
        const delay = SAVE_RESULT_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(`[ResultStore] saveTestResult attempt ${attempt}/${SAVE_RESULT_MAX_RETRIES} failed: ${msg} — retrying in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        console.error(
          `[ResultStore] CRITICAL: saveTestResult failed after ${SAVE_RESULT_MAX_RETRIES} attempts. ` +
          `Data lost for run=${runId} test=${testCaseId} verdict=${verdict}. Error: ${msg}. ` +
          `Full result: ${JSON.stringify(data)}`
        );
      }
    }
  }
}

/**
 * The run's environment is unusable: record every case as environment_error
 * with the reason, so the report shows why nothing executed.
 */
export async function recordEnvironmentError(
  runId: string, testCaseIds: string[], reason: string
): Promise<void> {
  for (const testCaseId of testCaseIds) {
    await saveTestResult(runId, testCaseId, "environment_error", 0, [{
      stepIndex: 0, action: "environment_validation", expected: "Environment reachable and configured",
      actual: reason, status: "failed", durationMs: 0,
    }], {}, []);
  }
}
