import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.ENCRYPTION_KEY = "e".repeat(64);

const slack = vi.hoisted(() => ({
  sendRunNotification: vi.fn(async () => ({ success: true })),
  sendFailureAlert: vi.fn(async () => ({ success: true })),
}));
const linear = vi.hoisted(() => ({ createBugIssue: vi.fn() }));

vi.mock("@/lib/db", async () => {
  const fake = (await import("../helpers/fake-config-db")).createFakeConfigDb();
  return {
    prisma: Object.assign(fake.prisma, {
      testRun: {
        update: vi.fn(async () => ({})),
        findUniqueOrThrow: vi.fn(async () => ({
          id: "r1", projectId: "p1", prNumber: null, commitSha: null, trigger: "manual", mode: "full", environment: null,
        })),
      },
      testResult: { findFirst: vi.fn(async () => null) },
    }),
  };
});
vi.mock("@/services/reporting/failure-analyzer", () => ({
  analyzeFailures: vi.fn(async () => ({ analyses: [] })),
  getHistoricalData: vi.fn(),
}));
vi.mock("@/services/reporting/report-generator", () => ({
  generateReport: vi.fn(async () => ({
    summary: {
      runId: "r1", totalTests: 2, passed: 1, failed: 1, flaky: 0, skipped: 0, durationMs: 1, summary: "s",
      failures: [{ testId: "t1", testName: "Checkout", severity: "critical", explanation: "boom", suggestedFix: null }],
    },
  })),
}));
vi.mock("@/services/reporting/integrations/slack", () => slack);
vi.mock("@/services/reporting/integrations/linear", () => linear);
vi.mock("@/services/reporting/integrations/github", () => ({ postPRComment: vi.fn(), createCheckRun: vi.fn() }));
vi.mock("@/services/reporting/integrations/outbound-webhooks", () => ({
  dispatchRunCompleted: vi.fn(),
  dispatchTestFailed: vi.fn(),
  dispatchBugDiscovered: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { fakeOf } from "../helpers/fake-config-db";
import { sealSecret } from "@/server/data/sealing";
import { runReportingPipeline } from "@/services/reporting/reporter";

const db = fakeOf(prisma);
const HOOK = "https://hooks.slack.com/services/T/B/NEW";

beforeEach(() => {
  vi.clearAllMocks();
  db.reset();
  // A stale legacy key that must lose to the typed row
  db.addWorkspace("w1", { slackWebhookUrl: sealSecret("https://hooks.slack.com/services/T/B/OLD") });
  db.addProject("p1", "w1");
});

describe("reporter reads Slack from IntegrationConfig", () => {
  it("sends with the sealed URL and honours the stored preferences", async () => {
    db.integrations.push({
      workspaceId: "w1", provider: "slack", status: "connected", credentialsSealed: sealSecret(HOOK),
      settings: { provider: "slack", notifications: { runCompleted: false, testFailed: true } },
    });

    const { integrations } = await runReportingPipeline("r1");

    expect(slack.sendRunNotification).not.toHaveBeenCalled();
    expect(slack.sendFailureAlert).toHaveBeenCalledWith(HOOK, expect.objectContaining({ testId: "t1" }), "p1");
    expect(integrations.slack).toEqual({ notification: false, alerts: 1 });
  });

  it("sends nothing once Slack is disconnected, even with the legacy key still in settings", async () => {
    db.integrations.push({ workspaceId: "w1", provider: "slack", status: "disconnected", credentialsSealed: null, settings: {} });

    await runReportingPipeline("r1");

    expect(slack.sendRunNotification).not.toHaveBeenCalled();
    expect(slack.sendFailureAlert).not.toHaveBeenCalled();
  });

  it("skips Linear issues when the typed settings turn auto-create off", async () => {
    db.integrations.push({
      workspaceId: "w1", provider: "linear", status: "connected", credentialsSealed: sealSecret("k"),
      settings: { provider: "linear", autoCreateIssues: false },
    });
    const findFirst = vi.mocked((prisma as unknown as { testResult: { findFirst: () => unknown } }).testResult.findFirst);

    await runReportingPipeline("r1");

    expect(findFirst).not.toHaveBeenCalled();
    expect(linear.createBugIssue).not.toHaveBeenCalled();
  });
});
