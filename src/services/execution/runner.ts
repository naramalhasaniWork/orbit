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
import { executeApiTestCase } from "@/services/execution/api-test-executor";
import type { TestCaseForExecution } from "@/services/execution/test-case-executor";
import type { StorageState } from "@/services/execution/browser-manager";
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
  } finally {
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
    await emitRunProgress(runId, { runId, status: "completed", currentTest: "", totalTests: 0, passed: 0, failed: 0, flaky: 0 });
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
  let consecutiveBrowserFailures = 0;
  let consecutiveProviderFailures = 0;
  let authState: StorageState | undefined;

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
      const useAuth = !needsFreshBrowser && !isLoginTest && authState ? authState : undefined;
      const roleCredentials = resolveRoleCredentials(validation.credentials, testCase.requiredRole);

      // API contract tests run over plain HTTP — no browser, no per-step
      // LLM loop. Falls back to the browser when the plan needs UI.
      let result =
        testCase.type === "api_contract"
          ? await executeApiTestCase(
              runId, testCase, validation.environmentUrl, roleCredentials
            )
          : null;
      if (!result) {
        result = await executeTestCase(
          runId, testCase, validation.environmentUrl, roleCredentials,
          { storageState: useAuth }
        );
      }

      // Always update auth state from passing tests (not just first time)
      if (result.storageState) {
        if (needsFreshBrowser) {
          authState = undefined;
          log("Auth state cleared after unauthenticated flow test");
        } else {
          authState = result.storageState;
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
      creditsConsumed: totalTests,
    },
  });

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
    id: tc.id, name: tc.name, type: tc.type,
    steps: tc.steps as Array<{ action: string; expected: string; selector?: string }>,
    projectId: tc.projectId, isCritical: tc.isCritical,
    requiredRole: tc.requiredRole ?? undefined,
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

const SAVE_RESULT_MAX_RETRIES = 3;
const SAVE_RESULT_BASE_DELAY_MS = 500;

async function saveTestResult(
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
        console.warn(`[Runner] saveTestResult attempt ${attempt}/${SAVE_RESULT_MAX_RETRIES} failed: ${msg} — retrying in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        console.error(
          `[Runner] CRITICAL: saveTestResult failed after ${SAVE_RESULT_MAX_RETRIES} attempts. ` +
          `Data lost for run=${runId} test=${testCaseId} verdict=${verdict}. Error: ${msg}. ` +
          `Full result: ${JSON.stringify(data)}`
        );
      }
    }
  }
}

/**
 * Resolve credentials for a specific user role.
 * Looks for role-prefixed keys (e.g. ADMIN_EMAIL, ADMIN_PASSWORD) first,
 * then falls back to generic TEST_* keys.
 */
function resolveRoleCredentials(
  allCredentials: Record<string, string>,
  requiredRole?: string
): Record<string, string> {
  if (!requiredRole) return allCredentials;

  const prefix = requiredRole.toUpperCase();
  const roleCredentials: Record<string, string> = { ...allCredentials };
  const suffixes = ["EMAIL", "PASSWORD", "API_KEY", "TOKEN", "USERNAME"];

  for (const suffix of suffixes) {
    const roleKey = `${prefix}_${suffix}`;
    const genericKey = `TEST_${suffix}`;
    if (allCredentials[roleKey]) {
      roleCredentials[genericKey] = allCredentials[roleKey];
    }
  }

  return roleCredentials;
}
