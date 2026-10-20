import { prisma } from "@/lib/db";
import { emitRunProgress, emitRunStarted, emitRunCompleted } from "@/lib/websocket";
import { validateEnvironment } from "@/services/execution/environment-validator";
import { loadTestCases } from "@/services/execution/test-case-loader";
import { chargeRunCredits } from "@/lib/billing/run-credits";
import { recordEnvironmentError } from "@/services/execution/test-result-store";
import { clearRunToolCallCount } from "@/services/mcp/tool-injector";
import { dispatchRunStarted, dispatchRunCompleted } from "@/services/reporting/integrations/outbound-webhooks";
import { acquireLock, releaseLock } from "@/lib/redis/lock";
import { runCases, type RunCounters } from "@/server/engine/runner/run-cases";
import { ShutdownError } from "@/lib/queue/shutdown";
import { RunLockedError } from "@/lib/queue/run-locked";
import { isBudgetExceeded } from "@/server/ai/errors";

// Run lifecycle around the one case loop (server/engine/runner/run-cases):
// lock, environment validation, case loading, terminal status and webhooks.

const RUN_LOCK_TTL_SECONDS = 300; // 5 min lock with auto-refresh
const RUN_LOCK_RETRY_MS = 30_000;
const TERMINAL_STATUSES: string[] = ["completed", "failed", "cancelled"];

interface RunOptions {
  runId: string;
  environmentId: string;
  /** Cases run concurrently across journeys when > 1 */
  concurrency?: number;
  /** Plan and mode chosen by the pipeline; default to the run's own */
  testPlanId?: string;
  mode?: string;
}

export async function executeRun(options: RunOptions): Promise<void> {
  const { runId } = options;

  const lock = await acquireLock(`run-lock:${runId}`, RUN_LOCK_TTL_SECONDS);
  if (!lock.acquired) {
    // A finished run has nothing left to do. Otherwise the holder is either
    // live (it refreshes the lock) or dead (the lock expires after its TTL):
    // retry later rather than reporting success for work nobody did.
    const current = await prisma.testRun.findUnique({ where: { id: runId }, select: { status: true } });
    if (!current || TERMINAL_STATUSES.includes(current.status)) {
      console.warn(`[Runner] Run ${runId} already finished — skipping`);
      return;
    }
    console.warn(`[Runner] Run ${runId} is locked by another worker — will retry`);
    throw new RunLockedError(runId, RUN_LOCK_RETRY_MS);
  }

  try {
    await executeRunInner(options);
  } catch (err) {
    // Shutdown is retryable: results are upserted and recorded cases are
    // skipped, so the next worker resumes where this one stopped.
    if (err instanceof ShutdownError || err instanceof RunLockedError) throw err;
    // Never leave the run "executing": record the crash as a terminal failure.
    // Not rethrown here — other crashes are not safe to retry.
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Runner] Run ${runId} crashed:`, err);
    await failRun(runId, isBudgetExceeded(err) ? msg : `Execution crashed: ${msg}`).catch((failErr) =>
      console.error(`[Runner] Could not mark run ${runId} failed:`, failErr)
    );
  } finally {
    clearRunToolCallCount(runId);
    await releaseLock(lock);
  }
}

async function executeRunInner(options: RunOptions): Promise<void> {
  const { runId, environmentId } = options;
  const log = (msg: string) => console.log(`[Runner:${runId.slice(0, 8)}] ${msg}`);

  log(`Starting execution (env: ${environmentId})`);

  await prisma.testRun.update({
    where: { id: runId },
    data: { status: "executing", startedAt: new Date() },
  });

  const stored = await prisma.testRun.findUniqueOrThrow({
    where: { id: runId },
    select: { id: true, projectId: true, testPlanId: true, mode: true, trigger: true, prNumber: true, metadata: true },
  });
  const run = { ...stored, testPlanId: options.testPlanId ?? stored.testPlanId, mode: options.mode ?? stored.mode };

  log(`Validating environment...`);
  const validation = await validateEnvironment(environmentId);
  if (!validation.valid) {
    const reason = `Environment validation failed: ${validation.errors.join("; ")}`;
    log(reason);
    const cases = await loadTestCases(run);
    await recordEnvironmentError(runId, cases.map((c) => c.id), reason);
    await failRun(runId, reason);
    return;
  }
  log(`Environment OK: ${validation.environmentUrl} (warnings: ${validation.warnings.length})`);

  const testCases = await loadTestCases(run);
  log(`Loaded ${testCases.length} test cases (mode: ${run.mode})`);
  if (testCases.length === 0) {
    await prisma.testRun.update({
      where: { id: runId },
      data: { status: "completed", summary: "No test cases to execute", completedAt: new Date(), totalTests: 0 },
    });
    await emitRunProgress(runId, { runId, status: "completed", currentTest: "", totalTests: 0, passed: 0, failed: 0, flaky: 0 });
    return;
  }

  await prisma.testRun.update({ where: { id: runId }, data: { totalTests: testCases.length } });

  await emitRunStarted(runId, {
    runId, projectId: run.projectId, mode: run.mode, trigger: run.trigger, totalTests: testCases.length,
  });

  // Fire run.started webhook asynchronously
  dispatchRunStarted(run.projectId, {
    runId, mode: run.mode, trigger: run.trigger,
  }).catch((err) => console.error("[Runner] Webhook delivery failed:", err));

  const { counters, stop } = await runCases({
    runId, environmentId,
    environmentUrl: validation.environmentUrl,
    credentials: validation.credentials,
    cases: testCases,
    concurrency: options.concurrency ?? 1,
  });

  if (stop?.kind === "cancelled") {
    await prisma.testRun.update({ where: { id: runId }, data: { status: "cancelled", completedAt: new Date() } });
    await chargeRunCredits(runId);
    await emitRunProgress(runId, {
      runId, status: "cancelled", currentTest: "", totalTests: testCases.length,
      passed: counters.passed, failed: counters.failed, flaky: counters.flaky,
    });
    return;
  }
  if (stop?.kind === "aborted") {
    log(`ABORTING: ${stop.reason}`);
    await failRun(runId, stop.reason);
    return;
  }

  await completeRun(runId, testCases.length, counters);
}

async function failRun(runId: string, summary: string): Promise<void> {
  await prisma.testRun.update({
    where: { id: runId },
    data: { status: "failed", summary, completedAt: new Date() },
  });
  await chargeRunCredits(runId);
  await emitRunProgress(runId, { runId, status: "failed", currentTest: "", totalTests: 0, passed: 0, failed: 0, flaky: 0 });
}

async function completeRun(
  runId: string, totalTests: number,
  counters: RunCounters
): Promise<void> {
  const completedAt = new Date();
  const startedAt = (
    await prisma.testRun.findUnique({ where: { id: runId }, select: { startedAt: true } })
  )?.startedAt;
  const durationMs = startedAt ? completedAt.getTime() - startedAt.getTime() : 0;

  await prisma.testRun.update({
    where: { id: runId },
    data: {
      status: "completed", passed: counters.passed, failed: counters.failed,
      flaky: counters.flaky, skipped: counters.skipped, completedAt, durationMs,
    },
  });

  const creditsConsumed = await chargeRunCredits(runId);

  await emitRunProgress(runId, {
    runId, status: "completed", currentTest: "", totalTests, passed: counters.passed, failed: counters.failed, flaky: counters.flaky,
  });

  const completedRun = await prisma.testRun.findUnique({ where: { id: runId }, select: { projectId: true } });
  const projectId = completedRun?.projectId ?? "";
  await emitRunCompleted(runId, {
    runId, projectId, status: "completed",
    totalTests, passed: counters.passed, failed: counters.failed, flaky: counters.flaky, durationMs,
  });

  // Fire webhooks asynchronously — don't block run completion
  // Note: the reporter pipeline also fires webhooks with richer data;
  // this is a fallback for direct executeRun() calls outside the full pipeline
  if (projectId) {
    const completedRunData = await prisma.testRun.findUnique({
      where: { id: runId },
      select: { mode: true, trigger: true },
    });
    dispatchRunCompleted(projectId, {
      runId, projectId, totalTests, passed: counters.passed, failed: counters.failed,
      flaky: counters.flaky, skipped: counters.skipped, durationMs,
      creditsConsumed,
      mode: (completedRunData?.mode as "full" | "smoke" | "regression" | "targeted") ?? "full",
      trigger: (completedRunData?.trigger as "push" | "pr" | "scheduled" | "manual" | "linear" | "api") ?? "manual",
      summary: `${counters.passed}/${totalTests} passed`,
      failures: [],
    }).catch((err) => console.error("[Runner] Webhook delivery failed:", err));
  }
}

/** Sequential entry point -- used by orchestrator pipeline */
export async function runTestSuite(runId: string, testPlanId: string, mode: string): Promise<void> {
  await runPipelineSuite(runId, { testPlanId, mode, concurrency: 1 });
}

/** Parallel entry point -- journeys run concurrently, up to maxConcurrency */
export async function runTestSuiteParallel(
  runId: string, testPlanId: string, mode: string, maxConcurrency = 3
): Promise<void> {
  await runPipelineSuite(runId, { testPlanId, mode, concurrency: maxConcurrency });
}

async function runPipelineSuite(
  runId: string, options: Pick<RunOptions, "testPlanId" | "mode" | "concurrency">
): Promise<void> {
  const run = await prisma.testRun.findUniqueOrThrow({ where: { id: runId }, select: { environmentId: true } });
  if (!run.environmentId) {
    await failRun(runId, "No environment configured for this run");
    return;
  }
  await executeRun({ runId, environmentId: run.environmentId, ...options });
}
