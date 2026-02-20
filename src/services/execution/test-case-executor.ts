import { launchBrowser, closeBrowser } from "@/services/execution/browser-manager";
import type { BrowserInstance } from "@/services/execution/browser-manager";
import { executeTestSteps } from "@/services/execution/step-executor";
import {
  createEvidenceCollector,
  saveNetworkLog,
  saveConsoleLog,
} from "@/services/execution/evidence-collector";
import { detectFlakyFromRetry } from "@/services/execution/flaky-registry";

// ============================================================
// Types
// ============================================================

interface TestCaseForExecution {
  id: string;
  name: string;
  steps: Array<{
    action: string;
    expected: string;
    selector?: string;
  }>;
  projectId: string;
  isCritical: boolean;
}

interface TestCaseResult {
  verdict: string;
  durationMs: number;
  steps: Array<Record<string, unknown>>;
  artifacts: Record<string, string>;
  healedSelectors: string[];
}

// ============================================================
// Single Test Case Execution
// ============================================================

export async function executeTestCase(
  runId: string,
  testCase: TestCaseForExecution,
  environmentUrl: string,
  credentials: Record<string, string>
): Promise<TestCaseResult> {
  let browserInstance: BrowserInstance | null = null;
  const startTime = Date.now();

  try {
    browserInstance = await launchBrowser({
      headless: true,
      recordVideo: !process.env.PLAYWRIGHT_WS_ENDPOINT,
      storagePath: `/tmp/orbit-videos/${runId}`,
    });
    const { page, context } = browserInstance;

    await page.goto(environmentUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    const evidenceCollector = createEvidenceCollector(
      page, runId, testCase.id, context, testCase.projectId
    );
    evidenceCollector.startCapture();

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
    });

    evidenceCollector.stopCapture();

    // Handle retry for flaky detection
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
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown execution error";
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

export type { TestCaseForExecution, TestCaseResult };
