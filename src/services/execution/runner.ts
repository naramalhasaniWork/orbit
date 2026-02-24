import { prisma } from "@/lib/db";
import {
  emitRunProgress,
  emitRunStarted,
  emitRunCompleted,
  emitTestStarted,
  emitTestCompleted,
} from "@/lib/websocket";
import { publish, channels } from "@/lib/redis/pubsub";
import { validateEnvironment } from "@/services/execution/environment-validator";
import { isTestQuarantined } from "@/services/execution/flaky-registry";
import { executeTestCase } from "@/services/execution/test-case-executor";
import type { TestCaseForExecution } from "@/services/execution/test-case-executor";
import { isRunCancelled } from "@/services/orchestrator/run-manager";
import { executeParallel } from "@/services/orchestrator/parallel-executor";
import { dispatchRunStarted, dispatchRunCompleted } from "@/services/reporting/integrations/outbound-webhooks";
import { getRedis } from "@/lib/redis";
import type { TestVerdict } from "@/generated/prisma/enums";
import type { TestResultEvent } from "@/lib/websocket/channels";

const RUN_LOCK_TTL_SECONDS = 3600; // 1 hour max lock

interface RunOptions {
  runId: string;
  environmentId: string;
}

export async function executeRun(options: RunOptions): Promise<void> {
  const { runId, environmentId } = options;

  // Distributed lock: prevent two workers from executing the same run
  const redis = getRedis();
  const lockKey = `orbit:run-lock:${runId}`;
  const lockAcquired = await redis.set(lockKey, "locked", "EX", RUN_LOCK_TTL_SECONDS, "NX");
  if (!lockAcquired) {
    console.warn(`[Runner] Run ${runId} is already being executed by another worker — skipping`);
    return;
  }

  try {
    await executeRunInner(options);
  } finally {
    await redis.del(lockKey);
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

  const run = await prisma.testRun.findUniqueOrThrow({
    where: { id: runId },
    select: { projectId: true, testPlanId: true, mode: true },
  });

  log(`Validating environment...`);
  const validation = await validateEnvironment(environmentId);
  if (!validation.valid) {
    log(`Environment validation FAILED: ${validation.errors.join("; ")}`);
    await failRun(runId, `Environment validation failed: ${validation.errors.join("; ")}`);
    return;
  }
  log(`Environment OK: ${validation.environmentUrl} (warnings: ${validation.warnings.length})`);

  const testCases = await loadTestCases(run.projectId, run.testPlanId, run.mode);
  log(`Loaded ${testCases.length} test cases (mode: ${run.mode})`);
  if (testCases.length === 0) {
    await prisma.testRun.update({
      where: { id: runId },
      data: { status: "completed", summary: "No test cases to execute", completedAt: new Date(), totalTests: 0 },
    });
    await emitRunProgress(runId, { runId, status: "completed", currentTest: "", totalTests: 0, passed: 0, failed: 0 });
    return;
  }

  await prisma.testRun.update({ where: { id: runId }, data: { totalTests: testCases.length } });

  await emitRunStarted(runId, {
    runId, projectId: run.projectId, mode: run.mode, trigger: "manual", totalTests: testCases.length,
  });

  // Fire run.started webhook asynchronously
  dispatchRunStarted(run.projectId, {
    runId, mode: run.mode, trigger: "manual",
  }).catch((err) => console.error("[Runner] Webhook delivery failed:", err));

  const counters = { passed: 0, failed: 0, flaky: 0, skipped: 0 };

  for (const testCase of testCases) {
    if (await isRunCancelled(runId)) {
      await prisma.testRun.update({ where: { id: runId }, data: { status: "cancelled", completedAt: new Date() } });
      await emitRunProgress(runId, {
        runId, status: "cancelled", currentTest: "", totalTests: testCases.length,
        passed: counters.passed, failed: counters.failed,
      });
      return;
    }

    if (await isTestQuarantined(run.projectId, testCase.id)) {
      counters.skipped++;
      await saveTestResult(runId, testCase.id, "skipped", 0, [], {}, []);
      await emitTestResult(runId, testCase.id, "skipped", 0);
      continue;
    }

    log(`[${counters.passed + counters.failed + counters.skipped + 1}/${testCases.length}] Starting: ${testCase.name}`);
    await emitTestStarted(runId, { runId, testCaseId: testCase.id, testCaseName: testCase.name });
    await emitRunProgress(runId, {
      runId, status: "executing", currentTest: testCase.name,
      totalTests: testCases.length, passed: counters.passed, failed: counters.failed,
    });

    try {
      const result = await executeTestCase(runId, testCase, validation.environmentUrl, validation.credentials);

      const verdictMap: Record<string, keyof typeof counters> = {
        pass: "passed", fail: "failed", flaky: "flaky", healed: "passed",
      };
      counters[verdictMap[result.verdict] ?? "failed"]++;
      log(`  -> ${result.verdict.toUpperCase()} (${result.durationMs}ms)`);

      await saveTestResult(
        runId, testCase.id, result.verdict as TestVerdict,
        result.durationMs, result.steps, result.artifacts, result.healedSelectors
      );
      await emitTestResult(runId, testCase.id, result.verdict as TestVerdict, result.durationMs);
      await emitTestCompleted(runId, {
        runId, testCaseId: testCase.id, testCaseName: testCase.name,
        verdict: result.verdict as "pass" | "fail" | "flaky" | "skipped" | "healed",
        durationMs: result.durationMs,
      });
      await prisma.testCase.update({
        where: { id: testCase.id },
        data: { lastVerdict: result.verdict as TestVerdict, lastRunAt: new Date() },
      });
    } catch (err) {
      counters.failed++;
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      log(`  -> CRASH: ${errorMsg}`);
      await saveTestResult(runId, testCase.id, "fail", 0, [{
        stepIndex: 0, action: "execution", expected: "Test executes",
        actual: `Uncaught error: ${errorMsg}`, status: "failed", durationMs: 0,
      }], {}, []);
      await emitTestResult(runId, testCase.id, "fail", 0);
    }
  }

  await completeRun(runId, testCases.length, counters);
}

async function emitTestResult(
  runId: string, testCaseId: string, verdict: TestVerdict | string, durationMs: number
): Promise<void> {
  const event: TestResultEvent = {
    runId, testCaseId, verdict: verdict as TestResultEvent["verdict"], durationMs,
  };
  try {
    await publish(channels.runProgress(runId), { type: "test:result", payload: event });
  } catch (err) {
    console.error(`[Runner] Failed to emit test result for ${testCaseId}:`, err);
  }
}

async function failRun(runId: string, summary: string): Promise<void> {
  await prisma.testRun.update({
    where: { id: runId },
    data: { status: "failed", summary, completedAt: new Date() },
  });
  await emitRunProgress(runId, { runId, status: "failed", currentTest: "", totalTests: 0, passed: 0, failed: 0 });
}

async function completeRun(
  runId: string, totalTests: number,
  counters: { passed: number; failed: number; flaky: number; skipped: number }
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
      creditsConsumed: totalTests,
    },
  });

  await emitRunProgress(runId, {
    runId, status: "completed", currentTest: "", totalTests, passed: counters.passed, failed: counters.failed,
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
      creditsConsumed: totalTests,
      mode: (completedRunData?.mode as "full" | "smoke" | "regression" | "targeted") ?? "full",
      trigger: (completedRunData?.trigger as "push" | "pr" | "scheduled" | "manual" | "linear" | "api") ?? "manual",
      summary: `${counters.passed}/${totalTests} passed`,
      failures: [],
    }).catch((err) => console.error("[Runner] Webhook delivery failed:", err));
  }
}

async function loadTestCases(
  projectId: string, testPlanId: string | null, mode: string
): Promise<TestCaseForExecution[]> {
  const where: Record<string, unknown> = { projectId, isEnabled: true };
  if (testPlanId) where.testPlanId = testPlanId;
  if (mode === "smoke") where.priorityScore = { gte: 80 };
  else if (mode === "regression") where.lastVerdict = { in: ["fail", "flaky"] };

  const cases = await prisma.testCase.findMany({ where, orderBy: { priorityScore: "desc" } });
  return cases.map((tc) => ({
    id: tc.id, name: tc.name,
    steps: tc.steps as Array<{ action: string; expected: string; selector?: string }>,
    projectId: tc.projectId, isCritical: tc.isCritical,
  }));
}

/** Sequential entry point -- used by orchestrator pipeline */
export async function runTestSuite(runId: string, _testPlanId: string, _mode: string): Promise<void> {
  const run = await prisma.testRun.findUniqueOrThrow({ where: { id: runId }, select: { environmentId: true } });
  if (!run.environmentId) {
    await failRun(runId, "No environment configured for this run");
    return;
  }
  await executeRun({ runId, environmentId: run.environmentId });
}

/** Parallel entry point -- journey-based partitioning with concurrency control */
export async function runTestSuiteParallel(
  runId: string, testPlanId: string, mode: string, maxConcurrency = 3
): Promise<void> {
  const run = await prisma.testRun.findUniqueOrThrow({ where: { id: runId }, select: { environmentId: true } });
  if (!run.environmentId) {
    await failRun(runId, "No environment configured for this run");
    return;
  }

  const result = await executeParallel({ runId, testPlanId, environmentId: run.environmentId, mode, maxConcurrency });
  if (result.cancelled) {
    await prisma.testRun.update({ where: { id: runId }, data: { status: "cancelled", completedAt: new Date() } });
    return;
  }

  const totalTests = result.passed + result.failed + result.flaky + result.skipped;
  await completeRun(runId, totalTests, result);
}

async function saveTestResult(
  runId: string, testCaseId: string, verdict: TestVerdict, durationMs: number,
  steps: Array<Record<string, unknown>>, artifacts: Record<string, string>, healedSelectors: string[]
): Promise<void> {
  await prisma.testResult.create({
    data: {
      testRunId: runId, testCaseId, verdict, durationMs,
      steps: JSON.parse(JSON.stringify(steps)),
      artifacts: JSON.parse(JSON.stringify(artifacts)),
      healedSelectors: JSON.parse(JSON.stringify(healedSelectors)),
    },
  });
}
