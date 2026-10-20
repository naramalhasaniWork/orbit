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
import { executeCaseByType } from "@/services/execution/case-dispatcher";
import { loadTestCases } from "@/services/execution/test-case-loader";
import { resolveRoleCredentials } from "@/services/execution/role-credentials";
import { createRoleSessions } from "@/services/execution/role-sessions";
import { chargeRunCredits } from "@/lib/billing/run-credits";
import { saveTestResult, recordEnvironmentError } from "@/services/execution/test-result-store";
import { clearRunToolCallCount } from "@/services/mcp/tool-injector";
import { isRunCancelled } from "@/services/orchestrator/run-manager";
import { executeParallel } from "@/services/orchestrator/parallel-executor";
import { dispatchRunStarted, dispatchRunCompleted } from "@/services/reporting/integrations/outbound-webhooks";
import { acquireLock, releaseLock } from "@/lib/redis/lock";
import type { TestVerdict } from "@/generated/prisma/enums";
import type { TestResultEvent } from "@/lib/websocket/channels";

const RUN_LOCK_TTL_SECONDS = 300; // 5 min lock with auto-refresh

interface RunOptions {
  runId: string;
  environmentId: string;
}

export async function executeRun(options: RunOptions): Promise<void> {
  const { runId } = options;

  const lock = await acquireLock(`run-lock:${runId}`, RUN_LOCK_TTL_SECONDS);
  if (!lock.acquired) {
    console.warn(`[Runner] Run ${runId} is already being executed by another worker — skipping`);
    return;
  }

  try {
    await executeRunInner(options);
  } catch (err) {
    // Never leave the run "executing": record the crash as a terminal failure.
    // Not rethrown — a queue retry would re-run tests and duplicate results.
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Runner] Run ${runId} crashed:`, err);
    await failRun(runId, `Execution crashed: ${msg}`).catch((failErr) =>
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

  const run = await prisma.testRun.findUniqueOrThrow({
    where: { id: runId },
    select: { id: true, projectId: true, testPlanId: true, mode: true, trigger: true, prNumber: true, metadata: true },
  });

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

  const counters = { passed: 0, failed: 0, flaky: 0, skipped: 0 };
  let consecutiveBrowserFailures = 0;
  let consecutiveProviderFailures = 0;
  const sessions = createRoleSessions();

  const UNAUTH_PATTERNS = [
    "unauth", "redirect", "logout", "log out", "session expir",
    "without auth", "no auth", "sign out", "not logged in",
    "invalid credentials", "invalid login", "wrong password", "incorrect password",
    "without token", "no token", "expired session", "expired token",
  ];

  const AUTH_PATTERNS = [
    "login with valid", "log in with valid", "sign in with valid",
    "successful login", "successful sign", "authenticate with valid",
    "login with correct", "log in with correct",
  ];

  for (const testCase of testCases) {
    const nameLower = testCase.name.toLowerCase();
    const needsFreshBrowser = UNAUTH_PATTERNS.some((p) => nameLower.includes(p));
    const isLoginTest = AUTH_PATTERNS.some((p) => nameLower.includes(p));

    if (await isRunCancelled(runId)) {
      await prisma.testRun.update({ where: { id: runId }, data: { status: "cancelled", completedAt: new Date() } });
      await chargeRunCredits(runId);
      await emitRunProgress(runId, {
        runId, status: "cancelled", currentTest: "", totalTests: testCases.length,
        passed: counters.passed, failed: counters.failed, flaky: counters.flaky,
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
      totalTests: testCases.length, passed: counters.passed, failed: counters.failed, flaky: counters.flaky,
    });

    try {
      // Login tests always start fresh so they can test the full login flow
      const useAuth = !needsFreshBrowser && !isLoginTest ? sessions.get(testCase.requiredRole) : undefined;
      const roleCredentials = resolveRoleCredentials(validation.credentials, testCase.requiredRole);

      const result = await executeCaseByType(
        runId, testCase, validation.environmentUrl, roleCredentials,
        { storageState: useAuth }
      );

      // Always update auth state from passing tests (not just first time)
      if (result.storageState) {
        if (needsFreshBrowser) {
          sessions.replace(testCase.requiredRole, undefined);
          log("Auth state cleared after unauthenticated flow test");
        } else {
          sessions.replace(testCase.requiredRole, result.storageState);
          log("Auth state updated from passing test");
        }
      }

      const verdictMap: Record<string, keyof typeof counters> = {
        pass: "passed", fail: "failed", flaky: "flaky", healed: "passed",
        environment_error: "skipped", skipped: "skipped",
      };
      counters[verdictMap[result.verdict] ?? "failed"]++;
      if (result.verdict === "environment_error") {
        log(`  -> ENVIRONMENT_ERROR (${result.durationMs}ms) — not a test bug, environment issue`);
      } else if (result.verdict === "skipped") {
        log(`  -> SKIPPED (${result.durationMs}ms) — blocked before execution, see result detail`);
      } else {
        log(`  -> ${result.verdict.toUpperCase()} (${result.durationMs}ms)`);
      }

      // Platform AI provider failures (billing/auth/quota) poison every
      // subsequent test — abort instead of recording 29 false errors.
      const firstStep = result.steps?.[0] as Record<string, unknown> | undefined;
      if (
        result.verdict === "environment_error" &&
        firstStep?.action === "ai_provider"
      ) {
        consecutiveProviderFailures++;
        if (consecutiveProviderFailures >= 2) {
          log("ABORTING: AI provider unavailable (billing/auth/quota)");
          await failRun(
            runId,
            "Run aborted: Orbit's AI provider rejected executor requests (billing, auth, or quota). " +
              "This is a platform configuration issue, not an application failure. " +
              `Detail: ${String(firstStep.actual ?? "")}`
          );
          return;
        }
      } else {
        consecutiveProviderFailures = 0;
      }

      // Fail-fast: if consecutive browser connection failures, abort the run
      if (result.verdict === "fail" && result.steps?.[0]) {
        const firstStep = result.steps[0] as Record<string, unknown>;
        const actual = String(firstStep.actual ?? "");
        if (actual.includes("connectOverCDP") || actual.includes("Timeout")) {
          consecutiveBrowserFailures++;
          if (consecutiveBrowserFailures >= 3) {
            log("ABORTING: Browser unreachable after 3 consecutive connection failures");
            await failRun(runId, "Browser service unreachable — all connection attempts timed out. Check PLAYWRIGHT_WS_ENDPOINT.");
            return;
          }
        } else {
          consecutiveBrowserFailures = 0;
        }
      } else {
        consecutiveBrowserFailures = 0;
      }
      await saveTestResult(
        runId, testCase.id, result.verdict as TestVerdict,
        result.durationMs, result.steps, result.artifacts, result.healedSelectors
      );
      await emitTestResult(runId, testCase.id, result.verdict as TestVerdict, result.durationMs);
      await emitTestCompleted(runId, {
        runId, testCaseId: testCase.id, testCaseName: testCase.name,
        verdict: result.verdict as "pass" | "fail" | "flaky" | "skipped" | "healed" | "environment_error",
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
  await chargeRunCredits(runId);
  await emitRunProgress(runId, { runId, status: "failed", currentTest: "", totalTests: 0, passed: 0, failed: 0, flaky: 0 });
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

  const result = await executeParallel({ runId, testPlanId, environmentId: run.environmentId, mode, maxConcurrency })
    .finally(() => clearRunToolCallCount(runId));
  if (result.environmentError) {
    await failRun(runId, result.environmentError);
    return;
  }
  if (result.cancelled) {
    await prisma.testRun.update({ where: { id: runId }, data: { status: "cancelled", completedAt: new Date() } });
    await chargeRunCredits(runId);
    return;
  }

  const totalTests = result.passed + result.failed + result.flaky + result.skipped;
  await completeRun(runId, totalTests, result);
}
