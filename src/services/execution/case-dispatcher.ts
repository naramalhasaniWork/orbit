import { executeTestCase } from "@/services/execution/test-case-executor";
import type { TestCaseForExecution, TestCaseResult } from "@/services/execution/test-case-executor";
import { executeApiTestCase } from "@/services/execution/api-test-executor";
import type { StorageState } from "@/services/execution/browser-manager";
import { runVisualTest } from "@/services/visual-qa/visual-test-runner";
import { withModelMeter } from "@/server/engine/model-meter";
import type { CaseExecutor, CaseRunContext } from "@/server/engine/executors/case-executor";

// The case-executor registry: routes a test case to the executor for its
// type. Every run goes through here, so every type is treated the same way.

/** generateVisualRegressionCases writes "Navigate to <route>" as step 1. */
const VISUAL_ROUTE_RE = /^Navigate to (\S+)/i;

export function visualRoutePath(testCase: TestCaseForExecution): string | null {
  const match = testCase.steps[0]?.action.match(VISUAL_ROUTE_RE);
  return match ? match[1] : null;
}

/** Runs the case and stamps it with the model calls and cost it took. */
export async function executeCaseByType(
  runId: string,
  testCase: TestCaseForExecution,
  environmentUrl: string,
  credentials: Record<string, string>,
  options?: { storageState?: StorageState; environmentId?: string }
): Promise<TestCaseResult> {
  const ctx: CaseRunContext = { runId, environmentUrl, credentials, ...options };
  const { result, usage } = await withModelMeter(() => dispatchCase(testCase, ctx));
  return {
    ...result,
    execution: {
      executionMode: result.execution?.executionMode ?? "agent",
      divergedAtStep: result.execution?.divergedAtStep ?? null,
      modelCalls: usage.calls,
      modelCostUsd: usage.costUsd,
    },
  };
}

const visualExecutor: CaseExecutor = {
  kind: "visual",
  canRun: (testCase) => testCase.type === "visual_regression",
  run: (testCase, ctx) => executeVisualCase(
    ctx.runId, testCase, ctx.environmentUrl, ctx.credentials, ctx.storageState
  ),
};

// API contract tests run over plain HTTP; the browser is the fallback
const apiExecutor: CaseExecutor = {
  kind: "api",
  canRun: (testCase) => testCase.type === "api_contract",
  run: (testCase, ctx) => executeApiTestCase(ctx.runId, testCase, ctx.environmentUrl, ctx.credentials),
};

const browserExecutor: CaseExecutor = {
  kind: "browser",
  canRun: () => true,
  run: (testCase, ctx) => executeTestCase(
    ctx.runId, testCase, ctx.environmentUrl, ctx.credentials, { storageState: ctx.storageState }
  ),
};

/** Tried in order; the browser executor accepts every case, so it goes last. */
const EXECUTORS: CaseExecutor[] = [visualExecutor, apiExecutor, browserExecutor];

async function dispatchCase(testCase: TestCaseForExecution, ctx: CaseRunContext): Promise<TestCaseResult> {
  for (const executor of EXECUTORS) {
    if (!executor.canRun(testCase)) continue;
    const result = await executor.run(testCase, ctx);
    if (result) return result;
  }
  throw new Error(`No executor accepted test case ${testCase.id}`);
}

/**
 * Screenshot + baseline diff via runVisualTest, which stores the annotated
 * artifact the run page's Visual tab reads. Returns null (browser fallback)
 * when the case carries no route.
 */
async function executeVisualCase(
  runId: string,
  testCase: TestCaseForExecution,
  environmentUrl: string,
  credentials: Record<string, string>,
  existingSession?: StorageState
): Promise<TestCaseResult | null> {
  const routePath = visualRoutePath(testCase);
  if (!routePath) return null;

  const started = Date.now();
  try {
    const storageState = existingSession
      ?? await acquireSession(runId, testCase, environmentUrl, credentials);
    const result = await runVisualTest({
      runId, projectId: testCase.projectId, routePath, environmentUrl, storageState,
    });
    const comparison = result.isBaselineCapture
      ? "No baseline yet: captured this screenshot as the baseline"
      : result.diff?.summary ?? "Compared against baseline";
    return {
      verdict: result.passed ? "pass" : "fail",
      durationMs: result.durationMs,
      steps: [
        step(0, `navigate ${routePath}`, testCase.steps[0]?.expected, "Page loaded", true),
        step(1, "screenshot", testCase.steps[1]?.expected, `Stored ${result.screenshotKey}`, true),
        step(2, "visual_diff", testCase.steps[2]?.expected, comparison, result.passed),
      ],
      artifacts: { screenshot: result.screenshotKey },
      healedSelectors: [],
      // Hand a freshly acquired session back so the runner reuses it
      storageState: existingSession ? undefined : storageState,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      verdict: "environment_error",
      durationMs: Date.now() - started,
      steps: [step(0, `visual_test ${routePath}`, "Screenshot captured and compared", `Visual test could not run: ${msg}`, false)],
      artifacts: {},
      healedSelectors: [],
    };
  }
}

/**
 * No reusable session yet (visual cases often run before any login test):
 * log in the same way the browser executor does — an LLM-driven login with
 * the environment's test credentials — and keep the resulting session.
 * Without credentials the route is captured as an anonymous visitor sees it.
 */
async function acquireSession(
  runId: string,
  testCase: TestCaseForExecution,
  environmentUrl: string,
  credentials: Record<string, string>
): Promise<StorageState | undefined> {
  const hasCredentials = Object.values(credentials).some((v) => typeof v === "string" && v.length > 0);
  if (!hasCredentials) return undefined;

  const login = await executeTestCase(runId, {
    id: testCase.id,
    name: "Log in with valid credentials",
    projectId: testCase.projectId,
    isCritical: false,
    steps: [{
      action: "Log in using the provided test credentials",
      expected: "An authenticated page is shown (dashboard, account menu or sign-out link)",
    }],
  }, environmentUrl, credentials);
  return login.storageState;
}

function step(
  stepIndex: number, action: string, expected: string | undefined, actual: string, ok: boolean
): Record<string, unknown> {
  return { stepIndex, action, expected: expected ?? "", actual, status: ok ? "passed" : "failed", durationMs: 0 };
}
