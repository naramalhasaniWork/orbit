import { prisma } from "@/lib/db";
import { lockCredits, chargeCredits } from "./credit-buckets";

/** Verdicts that mean a test case actually ran (1 credit each). */
const BILLABLE_VERDICTS = ["pass", "fail", "flaky", "healed"] as const;

/**
 * Charge a run's credits to its workspace once it reaches a terminal state
 * (completed, failed or cancelled). This is the only place credits are
 * deducted, so manual, webhook and scheduled runs all cost the same.
 * 1 credit per executed test case; skipped/quarantined cases are free.
 * Idempotent per run: a retried job never charges twice.
 */
export async function chargeRunCredits(runId: string): Promise<number> {
  const run = await prisma.testRun.findUnique({
    where: { id: runId },
    select: { project: { select: { workspaceId: true } } },
  });
  if (!run) return 0;
  const workspaceId = run.project.workspaceId;

  const credits = await prisma.testResult.count({
    where: { testRunId: runId, verdict: { in: [...BILLABLE_VERDICTS] } },
  });

  await prisma.$transaction(async (tx) => {
    // Lock first so a retried job and a concurrent charge both see the latest buckets
    const locked = await lockCredits(tx, workspaceId);
    const existing = await tx.creditTransaction.findFirst({
      where: { testRunId: runId, type: "consumption" },
      select: { id: true },
    });
    if (existing) return;

    await tx.testRun.update({ where: { id: runId }, data: { creditsConsumed: credits } });
    if (credits <= 0) return;

    await chargeCredits(tx, workspaceId, locked, credits, {
      testRunId: runId,
      description: `Test run (${credits} test case${credits === 1 ? "" : "s"} executed)`,
    });
  });

  return credits;
}
