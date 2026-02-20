import { prisma } from "@/lib/db";
import { emitRunProgress } from "@/lib/websocket";
import { publish, channels } from "@/lib/redis/pubsub";
import { validateEnvironment } from "@/services/execution/environment-validator";
import { isTestQuarantined } from "@/services/execution/flaky-registry";
import { executeTestCase } from "@/services/execution/test-case-executor";
import type { TestCaseForExecution } from "@/services/execution/test-case-executor";
import type { TestVerdict } from "@/generated/prisma/enums";
import type { TestResultEvent } from "@/lib/websocket/channels";

// ============================================================
// Types
// ============================================================

interface RunOptions {
  runId: string;
  environmentId: string;
}

// ============================================================
// Run Orchestrator
// ============================================================

export async function executeRun(options: RunOptions): Promise<void> {
  const { runId, environmentId } = options;

  await prisma.testRun.update({
    where: { id: runId },
    data: { status: "executing", startedAt: new Date() },
  });

  const run = await prisma.testRun.findUniqueOrThrow({
    where: { id: runId },
    select: { projectId: true, testPlanId: true, mode: true },
  });

  // Validate environment
  const validation = await validateEnvironment(environmentId);
  if (!validation.valid) {
    await prisma.testRun.update({
      where: { id: runId },
      data: {
        status: "failed",
        summary: `Environment validation failed: ${validation.errors.join("; ")}`,
        completedAt: new Date(),
      },
    });
    await emitRunProgress(runId, {
      runId,
      status: "failed",
      currentTest: "",
      totalTests: 0,
      passed: 0,
      failed: 0,
    });
    return;
  }

  // Load test cases
  const testCases = await loadTestCases(run.projectId, run.testPlanId, run.mode);

  if (testCases.length === 0) {
    await prisma.testRun.update({
      where: { id: runId },
      data: {
        status: "completed",
        summary: "No test cases to execute",
        completedAt: new Date(),
        totalTests: 0,
      },
    });
    await emitRunProgress(runId, {
      runId,
      status: "completed",
      currentTest: "",
      totalTests: 0,
      passed: 0,
      failed: 0,
    });
    return;
  }

  await prisma.testRun.update({
    where: { id: runId },
    data: { totalTests: testCases.length },
  });

  // Execute all test cases
  const counters = { passed: 0, failed: 0, flaky: 0, skipped: 0 };

  for (const testCase of testCases) {
    const quarantined = await isTestQuarantined(run.projectId, testCase.id);
    if (quarantined) {
      counters.skipped++;
      await saveTestResult(runId, testCase.id, "skipped", 0, [], {}, []);
      await emitTestResult(runId, testCase.id, "skipped", 0);
      continue;
    }

    await emitRunProgress(runId, {
      runId,
      status: "executing",
      currentTest: testCase.name,
      totalTests: testCases.length,
      passed: counters.passed,
      failed: counters.failed,
    });

    try {
      const result = await executeTestCase(
        runId, testCase, validation.environmentUrl, validation.credentials
      );

      // Tally verdict
      const verdictCounterMap: Record<string, keyof typeof counters> = {
        pass: "passed",
        fail: "failed",
        flaky: "flaky",
        healed: "passed",
      };
      const counterKey = verdictCounterMap[result.verdict] ?? "failed";
      counters[counterKey]++;

      await saveTestResult(
        runId,
        testCase.id,
        result.verdict as TestVerdict,
        result.durationMs,
        result.steps,
        result.artifacts,
        result.healedSelectors
      );

      await emitTestResult(
        runId, testCase.id, result.verdict as TestVerdict, result.durationMs
      );

      await prisma.testCase.update({
        where: { id: testCase.id },
        data: { lastVerdict: result.verdict as TestVerdict, lastRunAt: new Date() },
      });
    } catch (err) {
      counters.failed++;
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      await saveTestResult(runId, testCase.id, "fail", 0, [{
        stepIndex: 0,
        action: "execution",
        expected: "Test executes",
        actual: `Uncaught error: ${errorMsg}`,
        status: "failed",
        durationMs: 0,
      }], {}, []);
      await emitTestResult(runId, testCase.id, "fail", 0);
    }
  }

  // Complete the run
  await completeRun(runId, testCases.length, counters);
}

// ============================================================
// Emit Test Result Event
// ============================================================

async function emitTestResult(
  runId: string,
  testCaseId: string,
  verdict: TestVerdict | string,
  durationMs: number
): Promise<void> {
  const event: TestResultEvent = {
    runId,
    testCaseId,
    verdict: verdict as TestResultEvent["verdict"],
    durationMs,
  };

  try {
    await publish(channels.runProgress(runId), {
      type: "test:result",
      payload: event,
    });
  } catch (err) {
    console.error(`[Runner] Failed to emit test result for ${testCaseId}:`, err);
  }
}

// ============================================================
// Complete Run
// ============================================================

async function completeRun(
  runId: string,
  totalTests: number,
  counters: { passed: number; failed: number; flaky: number; skipped: number }
): Promise<void> {
  const completedAt = new Date();
  const startedAt = (
    await prisma.testRun.findUnique({
      where: { id: runId },
      select: { startedAt: true },
    })
  )?.startedAt;

  const durationMs = startedAt ? completedAt.getTime() - startedAt.getTime() : 0;

  await prisma.testRun.update({
    where: { id: runId },
    data: {
      status: "completed",
      passed: counters.passed,
      failed: counters.failed,
      flaky: counters.flaky,
      skipped: counters.skipped,
      completedAt,
      durationMs,
      creditsConsumed: totalTests,
    },
  });

  await emitRunProgress(runId, {
    runId,
    status: "completed",
    currentTest: "",
    totalTests,
    passed: counters.passed,
    failed: counters.failed,
  });
}

// ============================================================
// Load Test Cases
// ============================================================

async function loadTestCases(
  projectId: string,
  testPlanId: string | null,
  mode: string
): Promise<TestCaseForExecution[]> {
  const where: Record<string, unknown> = {
    projectId,
    isEnabled: true,
  };

  if (testPlanId) {
    where.testPlanId = testPlanId;
  }

  if (mode === "smoke") {
    where.priorityScore = { gte: 80 };
  } else if (mode === "regression") {
    where.lastVerdict = { in: ["fail", "flaky"] };
  }

  const cases = await prisma.testCase.findMany({
    where,
    orderBy: { priorityScore: "desc" },
  });

  return cases.map((tc) => ({
    id: tc.id,
    name: tc.name,
    steps: tc.steps as Array<{ action: string; expected: string; selector?: string }>,
    projectId: tc.projectId,
    isCritical: tc.isCritical,
  }));
}

// ============================================================
// Pipeline Entry Point
// ============================================================

export async function runTestSuite(
  runId: string,
  _testPlanId: string,
  _mode: string
): Promise<void> {
  const run = await prisma.testRun.findUniqueOrThrow({
    where: { id: runId },
    select: { environmentId: true },
  });

  if (!run.environmentId) {
    await prisma.testRun.update({
      where: { id: runId },
      data: {
        status: "failed",
        summary: "No environment configured for this run",
        completedAt: new Date(),
      },
    });
    return;
  }

  await executeRun({ runId, environmentId: run.environmentId });
}

// ============================================================
// Save Test Result
// ============================================================

async function saveTestResult(
  runId: string,
  testCaseId: string,
  verdict: TestVerdict,
  durationMs: number,
  steps: Array<Record<string, unknown>>,
  artifacts: Record<string, string>,
  healedSelectors: string[]
): Promise<void> {
  await prisma.testResult.create({
    data: {
      testRunId: runId,
      testCaseId,
      verdict,
      durationMs,
      steps: JSON.parse(JSON.stringify(steps)),
      artifacts: JSON.parse(JSON.stringify(artifacts)),
      healedSelectors: JSON.parse(JSON.stringify(healedSelectors)),
    },
  });
}
