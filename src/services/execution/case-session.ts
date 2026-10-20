import { launchBrowser } from "@/services/execution/browser-manager";
import type { BrowserInstance, StorageState } from "@/services/execution/browser-manager";
import { detectAuthState } from "@/services/execution/auth-detector";
import {
  ACCESS_REJECTED_MESSAGE, installAccessHeaders, isAccessRejection, type AccessHeaders,
} from "@/services/execution/access-headers";

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

/** A result that blames the environment or platform, not the app under test. */
export function environmentErrorResult(action: string, expected: string, actual: string, startTime: number): CaseResultShape {
  const durationMs = Date.now() - startTime;
  return {
    verdict: "environment_error",
    durationMs,
    steps: [{ stepIndex: 0, action, expected, actual, status: "failed", durationMs }],
    artifacts: {},
    healedSelectors: [],
  };
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
 * Install the Cloudflare Access headers (scoped to the environment origin),
 * navigate to the environment and fix auth mismatches: clear the session for
 * tests that need a logged-out start, and return a `skipped` result when a
 * test needs login but there are no credentials and no reusable session
 * (it would grind against the login page and fail anyway).
 */
export async function prepareCasePage(
  instance: BrowserInstance,
  testCase: CaseIdentity,
  environmentUrl: string,
  credentials: Record<string, string>,
  accessHeaders: AccessHeaders | null,
  hasSession: boolean,
  log: (msg: string) => void,
  startTime: number
): Promise<CaseResultShape | null> {
  const { page, context } = instance;
  if (accessHeaders) await installAccessHeaders(context, environmentUrl, accessHeaders);

  log(`Navigating to ${environmentUrl}...`);
  await page.goto(environmentUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  log(`Page loaded: ${page.url()}`);
  if (isAccessRejection(page.url())) {
    return environmentErrorResult("cloudflare_access", "The environment loads through Cloudflare Access", ACCESS_REJECTED_MESSAGE, startTime);
  }

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
