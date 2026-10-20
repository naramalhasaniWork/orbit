import { prisma } from "@/lib/db";
import type { TestVerdict } from "@/generated/prisma/enums";

/**
 * Retried run jobs resume instead of repeating work: cases that already
 * have a TestResult for the run are skipped, and their stored verdicts are
 * folded back into the run counters.
 */
export type VerdictBucket = "passed" | "failed" | "flaky" | "skipped";

const VERDICT_BUCKET: Record<string, VerdictBucket> = {
  pass: "passed", fail: "failed", flaky: "flaky", healed: "passed",
  environment_error: "skipped", skipped: "skipped",
};

export function verdictBucket(verdict: TestVerdict | string): VerdictBucket {
  return VERDICT_BUCKET[verdict] ?? "failed";
}

/** testCaseId → verdict for every case already recorded on the run. */
export async function loadRecordedVerdicts(runId: string): Promise<Map<string, TestVerdict>> {
  const rows = await prisma.testResult.findMany({
    where: { testRunId: runId },
    select: { testCaseId: true, verdict: true },
  });
  return new Map(rows.map((r) => [r.testCaseId, r.verdict]));
}
