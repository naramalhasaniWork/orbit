import { launchBrowser, closeBrowser, captureStorageState } from "@/services/execution/browser-manager";
import { environmentErrorResult, launchCaseBrowser, prepareCasePage } from "@/services/execution/case-session";
import type { BrowserInstance, StorageState } from "@/services/execution/browser-manager";
import { executeTestSteps } from "@/services/execution/step-executor";
import { createEvidenceCollector } from "@/services/execution/evidence-collector";
import { detectFlakyFromRetry } from "@/services/execution/flaky-registry";
import { loadTestingNotes } from "@/agents/prompts/context-loader";
import type { InvariantResult } from "@/services/execution/invariant-checker";
import { collectCaseArtifacts } from "@/services/execution/case-artifacts";
import type { ExecutionMeta } from "@/services/execution/test-result-store";
import type { ActionRecorder } from "@/server/engine/replay/recorder";
import { isRunAbort } from "@/services/execution/run-abort";
import { isProviderError } from "@/services/execution/error-classifier";
import { installAccessHeaders, splitAccessCredentials } from "@/services/execution/access-headers";

// ============================================================
// Types
// ============================================================

interface TestCaseForExecution {
  id: string;
  name: string;
  type?: string;
  /** Cases in the same journey run in order on one worker (they may share state) */
  journey?: string | null;
  steps: Array<{
    action: string;
    expected: string;
    selector?: string;
  }>;
  projectId: string;
  isCritical: boolean;
  requiredRole?: string;
}

interface TestCaseResult {
  verdict: string;
  durationMs: number;
  steps: Array<Record<string, unknown>>;
  artifacts: Record<string, string>;
  healedSelectors: string[];
  storageState?: StorageState;
  invariants?: InvariantResult;
  /** Set by the dispatcher: execution mode, model calls and cost for this case */
  execution?: ExecutionMeta;
}

// ============================================================
// Single Test Case Execution
// ============================================================

export async function executeTestCase(
  runId: string,
  testCase: TestCaseForExecution,
  environmentUrl: string,
  rawCredentials: Record<string, string>,
  options?: {
    viewport?: { width: number; height: number };
    storageState?: StorageState;
    /** Records the first attempt for compile-and-replay (retries are never recorded) */
    recorder?: ActionRecorder;
  }
): Promise<TestCaseResult> {
  let browserInstance: BrowserInstance | null = null;
  const startTime = Date.now();
  // The Cloudflare Access token becomes request headers, never a credential the model sees.
  const { headers: accessHeaders, credentials } = splitAccessCredentials(rawCredentials);

  const log = (msg: string) => console.log(`[TestCase:${testCase.id.slice(0, 8)}] ${msg}`);

  try {
    log(`Launching browser (remote: ${!!process.env.PLAYWRIGHT_WS_ENDPOINT}, hasAuth: ${!!options?.storageState})...`);
    browserInstance = await launchCaseBrowser(runId, options);
    log("Browser connected");
    const { page, context } = browserInstance;

    const blocked = await prepareCasePage(
      browserInstance, testCase, environmentUrl, credentials, accessHeaders, !!options?.storageState, log, startTime
    );
    if (blocked) return blocked;

    const evidenceCollector = createEvidenceCollector(
      page, runId, testCase.id, context, testCase.projectId
    );
    evidenceCollector.startCapture();

    const testingNotes = await loadTestingNotes(testCase.projectId);

    const result = await executeTestSteps({
      page,
      projectId: testCase.projectId,
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      runId,
      steps: testCase.steps.map((s) => ({
        action: s.action,
        expected: s.expected,
        selectorHint: s.selector,
      })),
      environmentUrl,
      credentials,
      evidenceCollector,
      maxRetries: 1,
      testingNotes: testingNotes.length > 0 ? testingNotes : undefined,
      recorder: options?.recorder,
    });

    evidenceCollector.stopCapture();

    // Capture auth state for reuse in subsequent tests
    let capturedState: StorageState | undefined;
    if (result.verdict === "pass" || result.verdict === "healed") {
      try {
        capturedState = await captureStorageState(context);
      } catch {
        // Non-critical — proceed without session reuse
      }
    }

    // Handle retry for flaky detection
    // environment_error: skip retry — retrying against a broken environment wastes time
    let finalVerdict: string = result.verdict;
    if (result.verdict === "fail") {
      const retryResult = await retryTestCase(
        runId, testCase, environmentUrl, rawCredentials
      );

      if (retryResult) {
        const wasFlaky = await detectFlakyFromRetry(
          testCase.projectId, testCase.id, "fail", retryResult.verdict
        );
        finalVerdict = wasFlaky ? "flaky" : retryResult.verdict;
      }
    }

    const { artifacts, invariants } = await collectCaseArtifacts(page, evidenceCollector, {
      runId, testCase, environmentUrl, startTime, analyzeVisual: true, log,
    });

    return {
      verdict: finalVerdict,
      durationMs: Date.now() - startTime,
      steps: result.steps as unknown as Array<Record<string, unknown>>,
      artifacts,
      healedSelectors: result.healedSelectors,
      storageState: capturedState,
      invariants,
    };
  } catch (err) {
    // Shutdown, lost run lock or exhausted AI budget: stop the run, not just this case.
    if (isRunAbort(err)) throw err;
    const errorMsg = err instanceof Error ? err.message : "Unknown execution error";
    log(`EXECUTION ERROR: ${errorMsg}`);

    // Platform-side AI provider failures (billing, auth, quota) are not
    // app failures — recording them as test FAILs produces false errors.
    if (isProviderError(errorMsg)) {
      return environmentErrorResult("ai_provider", "Orbit's AI provider responds to executor requests",
        `Orbit platform error (not an app failure): ${errorMsg}`, startTime);
    }

    return {
      verdict: "fail",
      durationMs: Date.now() - startTime,
      steps: [{
        stepIndex: 0,
        action: "execution_setup",
        expected: "Browser launched and navigated",
        actual: `Execution failed: ${errorMsg}`,
        status: "failed",
        durationMs: Date.now() - startTime,
      }],
      artifacts: {},
      healedSelectors: [],
    };
  } finally {
    if (browserInstance) {
      await closeBrowser(browserInstance);
    }
  }
}

// ============================================================
// Retry Logic
// ============================================================

export async function retryTestCase(
  runId: string,
  testCase: TestCaseForExecution,
  environmentUrl: string,
  rawCredentials: Record<string, string>
): Promise<{ verdict: string } | null> {
  let retryBrowser: BrowserInstance | null = null;
  const { headers: accessHeaders, credentials } = splitAccessCredentials(rawCredentials);

  try {
    retryBrowser = await launchBrowser({ headless: true });
    const { page, context } = retryBrowser;
    if (accessHeaders) await installAccessHeaders(context, environmentUrl, accessHeaders);

    await page.goto(environmentUrl, { waitUntil: "domcontentloaded" });

    const evidenceCollector = createEvidenceCollector(page, runId, testCase.id);
    evidenceCollector.startCapture();

    const result = await executeTestSteps({
      page,
      projectId: testCase.projectId,
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      steps: testCase.steps.map((s) => ({
        action: s.action,
        expected: s.expected,
        selectorHint: s.selector,
      })),
      environmentUrl,
      credentials,
      evidenceCollector,
    });

    evidenceCollector.stopCapture();
    return { verdict: result.verdict };
  } catch {
    return null;
  } finally {
    if (retryBrowser) {
      await closeBrowser(retryBrowser);
    }
  }
}

export type { TestCaseForExecution, TestCaseResult };
