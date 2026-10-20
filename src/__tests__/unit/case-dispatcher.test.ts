import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/execution/test-case-executor", () => ({ executeTestCase: vi.fn() }));
vi.mock("@/services/execution/api-test-executor", () => ({ executeApiTestCase: vi.fn() }));
vi.mock("@/services/visual-qa/visual-test-runner", () => ({ runVisualTest: vi.fn() }));

import { executeTestCase } from "@/services/execution/test-case-executor";
import { executeApiTestCase } from "@/services/execution/api-test-executor";
import { runVisualTest } from "@/services/visual-qa/visual-test-runner";
import { executeCaseByType } from "@/services/execution/case-dispatcher";

const browser = executeTestCase as ReturnType<typeof vi.fn>;
const api = executeApiTestCase as ReturnType<typeof vi.fn>;
const visual = runVisualTest as ReturnType<typeof vi.fn>;

const visualCase = {
  id: "tc-v", name: "Visual regression: Pricing", type: "visual_regression",
  projectId: "p1", isCritical: false,
  steps: [
    { action: "Navigate to /pricing", expected: "Page loads and renders completely" },
    { action: "Capture full-page screenshot", expected: "Screenshot stored" },
    { action: "Compare against baseline screenshot", expected: "Within threshold" },
  ],
};
const browserResult = { verdict: "pass", durationMs: 5, steps: [], artifacts: {}, healedSelectors: [] };

describe("executeCaseByType", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    browser.mockResolvedValue(browserResult);
  });

  it("runs visual_regression cases through runVisualTest instead of the LLM executor", async () => {
    visual.mockResolvedValue({
      passed: false, isBaselineCapture: false, screenshotKey: "visual-qa/p1/run-1/_pricing.png",
      diff: { summary: "Header shifted 12px", isRegression: true }, durationMs: 900,
    });

    const result = await executeCaseByType("run-1", visualCase, "https://staging.example.com", {});

    expect(visual).toHaveBeenCalledWith({
      runId: "run-1", projectId: "p1", routePath: "/pricing",
      environmentUrl: "https://staging.example.com", storageState: undefined,
    });
    expect(browser).not.toHaveBeenCalled();
    expect(result.verdict).toBe("fail");
    expect(result.steps[2]).toMatchObject({ action: "visual_diff", actual: "Header shifted 12px", status: "failed" });
  });

  it("passes a first run that captures the baseline", async () => {
    visual.mockResolvedValue({
      passed: true, isBaselineCapture: true, screenshotKey: "k", durationMs: 100,
    });

    const result = await executeCaseByType("run-1", visualCase, "https://staging.example.com", {});

    expect(result.verdict).toBe("pass");
    expect(String(result.steps[2].actual)).toContain("baseline");
  });

  it("reports an environment error when the screenshot cannot be taken", async () => {
    visual.mockRejectedValue(new Error("browser unreachable"));

    const result = await executeCaseByType("run-1", visualCase, "https://staging.example.com", {});

    expect(result.verdict).toBe("environment_error");
  });

  it("falls back to the browser executor when a visual case has no route", async () => {
    await executeCaseByType(
      "run-1", { ...visualCase, steps: [{ action: "Look at the page", expected: "" }] },
      "https://staging.example.com", {}
    );

    expect(visual).not.toHaveBeenCalled();
    expect(browser).toHaveBeenCalled();
  });

  it("keeps api_contract on HTTP with browser fallback", async () => {
    api.mockResolvedValueOnce(null);
    const apiCase = { ...visualCase, type: "api_contract" };

    await executeCaseByType("run-1", apiCase, "https://staging.example.com", {});

    expect(api).toHaveBeenCalled();
    expect(browser).toHaveBeenCalled();
  });

  it("captures visual routes with the run's logged-in session", async () => {
    const session = { cookies: [{ name: "sid" }], origins: [] };
    visual.mockResolvedValue({ passed: true, isBaselineCapture: true, screenshotKey: "k", durationMs: 1 });

    await executeCaseByType("run-1", visualCase, "https://staging.example.com", { TEST_EMAIL: "qa@x.com" }, {
      storageState: session,
    });

    expect(browser).not.toHaveBeenCalled(); // no extra login needed
    expect(visual).toHaveBeenCalledWith(expect.objectContaining({ storageState: session }));
  });

  it("logs in first when there is no session but credentials exist, and returns the session", async () => {
    const session = { cookies: [{ name: "sid" }], origins: [] };
    browser.mockResolvedValue({ ...browserResult, storageState: session });
    visual.mockResolvedValue({ passed: true, isBaselineCapture: true, screenshotKey: "k", durationMs: 1 });

    const result = await executeCaseByType(
      "run-1", visualCase, "https://staging.example.com", { TEST_EMAIL: "qa@x.com" }
    );

    expect(browser).toHaveBeenCalledWith(
      "run-1", expect.objectContaining({ name: "Log in with valid credentials" }),
      "https://staging.example.com", { TEST_EMAIL: "qa@x.com" }
    );
    expect(visual).toHaveBeenCalledWith(expect.objectContaining({ storageState: session }));
    expect(result.storageState).toBe(session);
  });
});
