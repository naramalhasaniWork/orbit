import { executeTestCase } from "@/services/execution/test-case-executor";
import type { TestCaseForExecution, TestCaseResult } from "@/services/execution/test-case-executor";
import { executeApiTestCase } from "@/services/execution/api-test-executor";
import type { StorageState } from "@/services/execution/browser-manager";
import { runVisualTest } from "@/services/visual-qa/visual-test-runner";
import { isRunAbort } from "@/services/execution/run-abort";
import { splitAccessCredentials } from "@/services/execution/access-headers";

// Routes a test case to the executor for its type. Shared by the sequential
// runner and the parallel executor so both treat every type the same way.

/** generateVisualRegressionCases writes "Navigate to <route>" as step 1. */
const VISUAL_ROUTE_RE = /^Navigate to (\S+)/i;

export function visualRoutePath(testCase: TestCaseForExecution): string | null {
  const match = testCase.steps[0]?.action.match(VISUAL_ROUTE_RE);
  return match ? match[1] : null;
}

export async function executeCaseByType(
  runId: string,
  testCase: TestCaseForExecution,
  environmentUrl: string,
  credentials: Record<string, string>,
  options?: { storageState?: StorageState }
): Promise<TestCaseResult> {
  if (testCase.type === "visual_regression") {
    const visual = await executeVisualCase(
      runId, testCase, environmentUrl, credentials, options?.storageState
    );
    if (visual) return visual;
  }

  // API contract tests run over plain HTTP; the browser is the fallback. Their prompt lists
  // credential names, so the Cloudflare Access token is kept out of it.
  if (testCase.type === "api_contract") {
    const api = await executeApiTestCase(runId, testCase, environmentUrl, splitAccessCredentials(credentials).credentials);
    if (api) return api;
  }

  return executeTestCase(runId, testCase, environmentUrl, credentials, options);
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
    const accessHeaders = splitAccessCredentials(credentials).headers ?? undefined;
    const result = await runVisualTest({
      runId, projectId: testCase.projectId, routePath, environmentUrl, storageState, accessHeaders,
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
    if (isRunAbort(err)) throw err;
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
  const loginCredentials = splitAccessCredentials(credentials).credentials;
  const hasCredentials = Object.values(loginCredentials).some((v) => typeof v === "string" && v.length > 0);
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
