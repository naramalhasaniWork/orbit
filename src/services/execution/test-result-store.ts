import { prisma } from "@/lib/db";
import type { TestVerdict } from "@/generated/prisma/enums";

// Persists one test case's result for a run, with retries. Shared by the
// sequential runner and the parallel executor so every executed case is
// recorded (and billed — see chargeRunCredits).

const SAVE_RESULT_MAX_RETRIES = 3;
const SAVE_RESULT_BASE_DELAY_MS = 500;

export async function saveTestResult(
  runId: string, testCaseId: string, verdict: TestVerdict, durationMs: number,
  steps: Array<Record<string, unknown>>, artifacts: Record<string, string>, healedSelectors: string[]
): Promise<void> {
  const data = {
    testRunId: runId, testCaseId, verdict, durationMs,
    steps: JSON.parse(JSON.stringify(steps)),
    artifacts: JSON.parse(JSON.stringify(artifacts)),
    healedSelectors: JSON.parse(JSON.stringify(healedSelectors)),
  };

  for (let attempt = 1; attempt <= SAVE_RESULT_MAX_RETRIES; attempt++) {
    try {
      await prisma.testResult.create({ data });
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
