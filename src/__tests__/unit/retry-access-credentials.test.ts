import { describe, it, expect, vi } from "vitest";

const route = vi.hoisted(() => vi.fn());
const executeTestSteps = vi.hoisted(() => vi.fn(async () => ({ verdict: "pass" })));
vi.mock("@/services/execution/browser-manager", () => ({
  launchBrowser: vi.fn(async () => ({ page: { goto: vi.fn() }, context: { route }, browser: {}, isRemote: false })),
  closeBrowser: vi.fn(),
  captureStorageState: vi.fn(),
  VIEWPORT_PRESETS: {},
}));
vi.mock("@/services/execution/step-executor", () => ({ executeTestSteps }));
vi.mock("@/services/execution/evidence-collector", () => ({
  createEvidenceCollector: () => ({ startCapture: vi.fn(), stopCapture: vi.fn() }),
  saveNetworkLog: vi.fn(),
  saveConsoleLog: vi.fn(),
}));
vi.mock("@/services/execution/flaky-registry", () => ({ detectFlakyFromRetry: vi.fn() }));
vi.mock("@/agents/prompts/sub-agents/visual-analyzer", () => ({ analyzeVisualQuality: vi.fn() }));
vi.mock("@/services/execution/auth-detector", () => ({ detectAuthState: vi.fn() }));
vi.mock("@/agents/prompts/context-loader", () => ({ loadTestingNotes: vi.fn() }));
vi.mock("@/services/execution/invariant-checker", () => ({ runAllInvariants: vi.fn(), collectPageState: vi.fn() }));
vi.mock("@/lib/utils/ssrf", () => ({ safeFetch: vi.fn() }));

import { retryTestCase } from "@/services/execution/test-case-executor";

describe("retryTestCase with Cloudflare Access secrets", () => {
  it("keeps CF_ACCESS_* out of the executor's credentials and installs the origin-scoped headers", async () => {
    await retryTestCase(
      "run-1",
      { id: "tc-1", name: "Checkout", steps: [{ action: "click pay", expected: "paid" }], projectId: "p1", isCritical: false },
      "https://abc.acme.pages.dev",
      { TEST_EMAIL: "qa@acme.dev", CF_ACCESS_CLIENT_ID: "id.access", CF_ACCESS_CLIENT_SECRET: "s3cret" }
    );

    const [args] = executeTestSteps.mock.calls[0] as unknown as [{ credentials: Record<string, string> }];
    expect(args.credentials).toEqual({ TEST_EMAIL: "qa@acme.dev" });
    expect(JSON.stringify(executeTestSteps.mock.calls)).not.toContain("s3cret");
    expect(route).toHaveBeenCalledTimes(1);
  });
});
