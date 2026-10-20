import { prisma } from "@/lib/db";
import { emitRunProgress, emitTestStarted, emitTestCompleted } from "@/lib/websocket";
import { publish, channels } from "@/lib/redis/pubsub";
import { isTestQuarantined } from "@/services/execution/flaky-registry";
import { executeCaseByType } from "@/services/execution/case-dispatcher";
import { resolveRoleCredentials } from "@/services/execution/role-credentials";
import { createRoleSessions, type RoleSessions } from "@/services/execution/role-sessions";
import { saveTestResult } from "@/services/execution/test-result-store";
import { isRunCancelled } from "@/services/orchestrator/run-manager";
import type { TestCaseForExecution, TestCaseResult } from "@/services/execution/test-case-executor";
import type { TestVerdict } from "@/generated/prisma/enums";
import type { TestResultEvent } from "@/lib/websocket/channels";
import { partitionCases } from "./partition";

/**
 * The one test-case loop. Sequential and parallel runs differ only in
 * `concurrency`: cases are partitioned (see partitionCases) and up to
 * `concurrency` workers drain the partitions. Every executed case is
 * recorded, and sessions are shared per required role across workers.
 */

export interface RunCounters {
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
}

export type RunStop = { kind: "cancelled" } | { kind: "aborted"; reason: string };

export interface RunCasesInput {
  runId: string;
  environmentId: string;
  environmentUrl: string;
  credentials: Record<string, string>;
  cases: TestCaseForExecution[];
  concurrency: number;
}

export interface RunCasesOutcome {
  counters: RunCounters;
  stop: RunStop | null;
}

interface LoopState {
  counters: RunCounters;
  stop: RunStop | null;
  sessions: RoleSessions;
  consecutiveBrowserFailures: number;
  consecutiveProviderFailures: number;
}

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

const VERDICT_COUNTER: Record<string, keyof RunCounters> = {
  pass: "passed", fail: "failed", flaky: "flaky", healed: "passed",
  environment_error: "skipped", skipped: "skipped",
};

export async function runCases(input: RunCasesInput): Promise<RunCasesOutcome> {
  const partitions = partitionCases(input.cases, input.concurrency);
  const state: LoopState = {
    counters: { passed: 0, failed: 0, flaky: 0, skipped: 0 },
    stop: null,
    sessions: createRoleSessions(),
    consecutiveBrowserFailures: 0,
    consecutiveProviderFailures: 0,
  };

  let nextPartition = 0;
  const worker = async (): Promise<void> => {
    while (!state.stop && nextPartition < partitions.length) {
      for (const testCase of partitions[nextPartition++]) {
        if (state.stop) return;
        const stop = await checkBetweenCases(input.runId);
        if (stop) {
          state.stop ??= stop;
          return;
        }
        await runOneCase(input, testCase, state);
      }
    }
  };

  const workers = Math.max(1, Math.min(input.concurrency, partitions.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return { counters: state.counters, stop: state.stop };
}

/** Checked before every case: anything that should stop the run between cases goes here. */
async function checkBetweenCases(runId: string): Promise<RunStop | null> {
  if (await isRunCancelled(runId)) return { kind: "cancelled" };
  return null;
}

async function runOneCase(input: RunCasesInput, testCase: TestCaseForExecution, state: LoopState): Promise<void> {
  const { runId, cases } = input;
  const log = (msg: string) => console.log(`[Runner:${runId.slice(0, 8)}] ${msg}`);

  if (await isTestQuarantined(testCase.projectId, testCase.id)) {
    state.counters.skipped++;
    await saveTestResult(runId, testCase.id, "skipped", 0, [], {}, []);
    await emitTestResult(runId, testCase.id, "skipped", 0);
    return;
  }

  const { counters } = state;
  log(`[${counters.passed + counters.failed + counters.flaky + counters.skipped + 1}/${cases.length}] Starting: ${testCase.name}`);
  await emitTestStarted(runId, { runId, testCaseId: testCase.id, testCaseName: testCase.name });
  await emitRunProgress(runId, {
    runId, status: "executing", currentTest: testCase.name,
    totalTests: cases.length, passed: counters.passed, failed: counters.failed, flaky: counters.flaky,
  });

  try {
    const nameLower = testCase.name.toLowerCase();
    const needsFreshBrowser = UNAUTH_PATTERNS.some((p) => nameLower.includes(p));
    const isLoginTest = AUTH_PATTERNS.some((p) => nameLower.includes(p));
    // Login tests always start fresh so they can test the full login flow
    const storageState = !needsFreshBrowser && !isLoginTest ? state.sessions.get(testCase.requiredRole) : undefined;

    const result = await executeCaseByType(
      runId, testCase, input.environmentUrl,
      resolveRoleCredentials(input.credentials, testCase.requiredRole),
      { storageState, environmentId: input.environmentId }
    );

    // Keep the freshest session per role; an unauthenticated flow clears it
    if (result.storageState) {
      state.sessions.replace(testCase.requiredRole, needsFreshBrowser ? undefined : result.storageState);
    }

    counters[VERDICT_COUNTER[result.verdict] ?? "failed"]++;
    log(`  -> ${result.verdict.toUpperCase()} (${result.durationMs}ms)`);
    checkAbort(result, state);

    await saveTestResult(
      runId, testCase.id, result.verdict as TestVerdict, result.durationMs,
      result.steps, result.artifacts, result.healedSelectors, result.execution
    );
    await emitTestResult(runId, testCase.id, result.verdict, result.durationMs);
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

/**
 * Platform failures poison every later case: abort after 2 consecutive AI
 * provider rejections (billing/auth/quota) or 3 consecutive browser
 * connection failures, instead of recording dozens of false errors.
 */
function checkAbort(result: TestCaseResult, state: LoopState): void {
  const firstStep = result.steps?.[0] as Record<string, unknown> | undefined;

  if (result.verdict === "environment_error" && firstStep?.action === "ai_provider") {
    state.consecutiveProviderFailures++;
    if (state.consecutiveProviderFailures >= 2) {
      state.stop ??= {
        kind: "aborted",
        reason:
          "Run aborted: Orbit's AI provider rejected executor requests (billing, auth, or quota). " +
          "This is a platform configuration issue, not an application failure. " +
          `Detail: ${String(firstStep.actual ?? "")}`,
      };
    }
  } else {
    state.consecutiveProviderFailures = 0;
  }

  const actual = String(firstStep?.actual ?? "");
  if (result.verdict === "fail" && (actual.includes("connectOverCDP") || actual.includes("Timeout"))) {
    state.consecutiveBrowserFailures++;
    if (state.consecutiveBrowserFailures >= 3) {
      state.stop ??= {
        kind: "aborted",
        reason: "Browser service unreachable — all connection attempts timed out. Check PLAYWRIGHT_WS_ENDPOINT.",
      };
    }
  } else {
    state.consecutiveBrowserFailures = 0;
  }
}

async function emitTestResult(runId: string, testCaseId: string, verdict: string, durationMs: number): Promise<void> {
  const event: TestResultEvent = {
    runId, testCaseId, verdict: verdict as TestResultEvent["verdict"], durationMs,
  };
  try {
    await publish(channels.runProgress(runId), { type: "test:result", payload: event });
  } catch (err) {
    console.error(`[Runner] Failed to emit test result for ${testCaseId}:`, err);
  }
}
