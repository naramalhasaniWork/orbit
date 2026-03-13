import { launchBrowser, closeBrowser, captureStorageState, VIEWPORT_PRESETS } from "@/services/execution/browser-manager";
import type { BrowserInstance, ViewportName, StorageState } from "@/services/execution/browser-manager";
import { executeTestSteps } from "@/services/execution/step-executor";
import {
  createEvidenceCollector,
  saveNetworkLog,
  saveConsoleLog,
} from "@/services/execution/evidence-collector";
import { detectFlakyFromRetry } from "@/services/execution/flaky-registry";
import { analyzeVisualQuality } from "@/agents/prompts/sub-agents/visual-analyzer";
import { detectAuthState } from "@/services/execution/auth-detector";
import { loadTestingNotes } from "@/agents/prompts/context-loader";

// ============================================================
// Types
// ============================================================

interface TestCaseForExecution {
  id: string;
  name: string;
  type?: string;
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
}

// ============================================================
// Single Test Case Execution
// ============================================================

export async function executeTestCase(
  runId: string,
  testCase: TestCaseForExecution,
  environmentUrl: string,
  credentials: Record<string, string>,
  options?: { viewport?: { width: number; height: number }; storageState?: StorageState }
): Promise<TestCaseResult> {
  let browserInstance: BrowserInstance | null = null;
  const startTime = Date.now();

  const log = (msg: string) => console.log(`[TestCase:${testCase.id.slice(0, 8)}] ${msg}`);

  try {
    log(`Launching browser (remote: ${!!process.env.PLAYWRIGHT_WS_ENDPOINT}, hasAuth: ${!!options?.storageState})...`);
    browserInstance = await launchBrowser({
      headless: true,
      recordVideo: !process.env.PLAYWRIGHT_WS_ENDPOINT,
      storagePath: `/tmp/orbit-videos/${runId}`,
      viewport: options?.viewport,
      storageState: options?.storageState,
    });
    log("Browser connected");
    const { page, context } = browserInstance;

    log(`Navigating to ${environmentUrl}...`);
    await page.goto(environmentUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    log(`Page loaded: ${page.url()}`);

    // Detect and handle auth state mismatches before test execution
    const authState = await detectAuthState(page, testCase.name, log);
    if (authState.needsLogout) {
      log("Page is authenticated but test needs fresh state — clearing cookies");
      await context.clearCookies();
      await page.goto(environmentUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
      log(`Reloaded after clearing cookies: ${page.url()}`);
    }

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
      credentials,
      evidenceCollector,
      maxRetries: 1,
      testingNotes: testingNotes.length > 0 ? testingNotes : undefined,
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
        runId, testCase, environmentUrl, credentials
      );

      if (retryResult) {
        const wasFlaky = await detectFlakyFromRetry(
          testCase.projectId, testCase.id, "fail", retryResult.verdict
        );
        finalVerdict = wasFlaky ? "flaky" : retryResult.verdict;
      }
    }

    // Save evidence artifacts
    const evidence = evidenceCollector.getEvidence();
    const artifacts: Record<string, string> = {};

    // Finalize video recording before closing browser
    const videoUrl = await evidenceCollector.finalizeVideo();
    if (videoUrl) {
      artifacts.videoUrl = videoUrl;
    }

    if (evidence.screenshots.length > 0) {
      artifacts.screenshots = JSON.stringify(evidence.screenshots);
    }

    // Visual quality analysis on last screenshot
    if (evidence.screenshots.length > 0) {
      try {
        const visualResult = await analyzeVisualQuality(
          evidence.screenshots[evidence.screenshots.length - 1],
          testCase,
          environmentUrl,
        );
        artifacts.visualAnalysis = JSON.stringify(visualResult);
      } catch {
        // Visual analysis is non-blocking — don't fail the test
      }
    }

    if (evidence.networkLog.length > 0) {
      artifacts.networkLog = await saveNetworkLog(
        runId, testCase.id, evidence.networkLog, testCase.projectId
      );
    }
    if (evidence.consoleLog.length > 0) {
      artifacts.consoleLog = await saveConsoleLog(
        runId, testCase.id, evidence.consoleLog, testCase.projectId
      );
    }
    if (evidence.domSnapshot) {
      artifacts.domSnapshot = evidence.domSnapshot;
    }

    return {
      verdict: finalVerdict,
      durationMs: Date.now() - startTime,
      steps: result.steps as unknown as Array<Record<string, unknown>>,
      artifacts,
      healedSelectors: result.healedSelectors,
      storageState: capturedState,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown execution error";
    log(`EXECUTION ERROR: ${errorMsg}`);
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

async function retryTestCase(
  runId: string,
  testCase: TestCaseForExecution,
  environmentUrl: string,
  credentials: Record<string, string>
): Promise<{ verdict: string } | null> {
  let retryBrowser: BrowserInstance | null = null;

  try {
    retryBrowser = await launchBrowser({ headless: true });
    const { page } = retryBrowser;

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

// ============================================================
// Multi-Viewport Execution
// ============================================================

export async function executeWithViewports(
  runId: string,
  testCase: TestCaseForExecution,
  environmentUrl: string,
  credentials: Record<string, string>,
  viewports: ViewportName[] = ["desktop", "tablet", "mobile"]
): Promise<TestCaseResult & { viewportResults: Record<string, TestCaseResult> }> {
  const viewportResults: Record<string, TestCaseResult> = {};

  for (const vp of viewports) {
    const vpTestCase = {
      ...testCase,
      id: `${testCase.id}-${vp}`,
      name: `${testCase.name} (${vp})`,
    };
    viewportResults[vp] = await executeTestCase(
      runId,
      vpTestCase,
      environmentUrl,
      credentials,
      { viewport: VIEWPORT_PRESETS[vp] }
    );
  }

  // Primary result is desktop (or first viewport)
  const primary = viewportResults[viewports[0]] ?? viewportResults.desktop;
  return { ...primary, viewportResults };
}

export type { TestCaseForExecution, TestCaseResult };
