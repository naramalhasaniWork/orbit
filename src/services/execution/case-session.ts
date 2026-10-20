import { launchBrowser } from "@/services/execution/browser-manager";
import type { BrowserInstance, StorageState } from "@/services/execution/browser-manager";
import { detectAuthState } from "@/services/execution/auth-detector";

// Opening a case's browser and landing on the environment in the right auth
// state. Shared by the agent and replay executors so both start identically.

interface CaseIdentity {
  name: string;
}

interface CaseResultShape {
  verdict: string;
  durationMs: number;
  steps: Array<Record<string, unknown>>;
  artifacts: Record<string, string>;
  healedSelectors: string[];
}

export async function launchCaseBrowser(
  runId: string,
  options?: { viewport?: { width: number; height: number }; storageState?: StorageState }
): Promise<BrowserInstance> {
  return launchBrowser({
    headless: true,
    recordVideo: !process.env.PLAYWRIGHT_WS_ENDPOINT,
    storagePath: `/tmp/orbit-videos/${runId}`,
    viewport: options?.viewport,
    storageState: options?.storageState,
  });
}

/**
 * Navigate to the environment and fix auth mismatches: clear the session for
 * tests that need a logged-out start, and return a `skipped` result when a
 * test needs login but there are no credentials and no reusable session
 * (it would grind against the login page and fail anyway).
 */
export async function prepareCasePage(
  instance: BrowserInstance,
  testCase: CaseIdentity,
  environmentUrl: string,
  credentials: Record<string, string>,
  hasSession: boolean,
  log: (msg: string) => void,
  startTime: number
): Promise<CaseResultShape | null> {
  const { page, context } = instance;

  log(`Navigating to ${environmentUrl}...`);
  await page.goto(environmentUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  log(`Page loaded: ${page.url()}`);

  // Detect and handle auth state mismatches before test execution
  const authState = await detectAuthState(page, testCase.name, log);

  const hasCredentials = Object.values(credentials ?? {}).some(
    (v) => typeof v === "string" && v.length > 0
  );
  if (authState.needsLogin && !hasCredentials && !hasSession) {
    log("BLOCKED: requires authentication but no test credentials are configured — skipping");
    return {
      verdict: "skipped",
      durationMs: Date.now() - startTime,
      steps: [{
        stepIndex: 0,
        action: "auth_preflight",
        expected: "Authenticated session or test credentials available",
        actual:
          "Blocked: this test requires login but no test credentials are configured for this environment. Add credentials in Settings → Environments to unblock it.",
        status: "skipped",
        durationMs: Date.now() - startTime,
      }],
      artifacts: {},
      healedSelectors: [],
    };
  }

  if (authState.needsLogout) {
    log("Page is authenticated but test needs fresh state — clearing cookies");
    await context.clearCookies();
    await page.goto(environmentUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    log(`Reloaded after clearing cookies: ${page.url()}`);
  }
  return null;
}
