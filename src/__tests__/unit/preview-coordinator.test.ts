import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  previewDeployment: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  environment: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: db }));
const launchPipelineRun = vi.hoisted(() => vi.fn());
vi.mock("@/services/orchestrator/run-launcher", () => ({ launchPipelineRun }));
const upsertCheckRun = vi.hoisted(() => vi.fn());
vi.mock("@/services/reporting/integrations/github-checks", () => ({
  upsertCheckRun,
  findOpenPullRequestsForCommit: vi.fn().mockResolvedValue([]),
}));
const resolve = vi.hoisted(() => vi.fn());
vi.mock("@/services/preview/registry", () => ({ getPreviewProvider: () => ({ id: "railway", resolve }) }));
vi.mock("@/services/preview/connections", () => ({ connectionAccess: () => ({ token: "t", config: {} }) }));
vi.mock("@/lib/utils/ssrf", () => ({ assertPublicUrl: vi.fn().mockResolvedValue(undefined), UnsafeUrlError: Error }));

import { advancePreviewDeployment } from "@/services/preview/coordinator";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "pd1", projectId: "p1", bindingId: "b1", commitSha: "abc", branch: "feat", prNumber: 42,
    status: "pending", checkRunId: "check-1", createdAt: new Date(),
    binding: {
      id: "b1", targetRef: "rp/rs", allowedHostSuffixes: ["up.railway.app"], accessSecretPrefix: null,
      connection: { provider: "railway", credentials: {}, config: {} },
    },
    ...overrides,
  };
}

describe("advancePreviewDeployment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.previewDeployment.updateMany.mockResolvedValue({ count: 1 });
    db.environment.findFirst.mockResolvedValue(null);
    db.environment.create.mockResolvedValue({ id: "env-pr-42" });
    launchPipelineRun.mockResolvedValue({ ok: true, runId: "run-1" });
  });

  it("on ready: upserts the PR's preview environment and launches the run with environmentId and prNumber", async () => {
    db.previewDeployment.findUnique.mockResolvedValue(row());
    resolve.mockResolvedValue({ state: "ready", url: "https://web-pr-42.up.railway.app", externalId: "dep-1" });

    expect(await advancePreviewDeployment("pd1")).toBe("ready");

    expect(db.environment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "p1", type: "preview", url: "https://web-pr-42.up.railway.app", source: "preview", sourceId: "b1:42",
      }),
      select: { id: true },
    });
    expect(launchPipelineRun).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "p1", trigger: "pr", prNumber: 42, environmentId: "env-pr-42", commitSha: "abc" })
    );
    expect(upsertCheckRun).toHaveBeenCalledWith("p1", expect.objectContaining({
      checkRunId: "check-1", status: "completed", conclusion: "success",
    }));
  });

  it("does not launch when another worker already moved the row (no double runs)", async () => {
    db.previewDeployment.findUnique.mockResolvedValue(row());
    resolve.mockResolvedValue({ state: "ready", url: "https://web-pr-42.up.railway.app", externalId: "dep-1" });
    db.previewDeployment.updateMany.mockResolvedValue({ count: 0 });

    await advancePreviewDeployment("pd1");
    expect(launchPipelineRun).not.toHaveBeenCalled();
  });

  it("fails the preview instead of testing a URL outside the allowed hosts", async () => {
    db.previewDeployment.findUnique.mockResolvedValue(row());
    resolve.mockResolvedValue({ state: "ready", url: "https://attacker.example.com", externalId: "dep-1" });

    expect(await advancePreviewDeployment("pd1")).toBe("failed");
    expect(launchPipelineRun).not.toHaveBeenCalled();
    expect(upsertCheckRun).toHaveBeenCalledWith("p1", expect.objectContaining({ conclusion: "failure" }));
  });

  it("times out to a neutral check after 15 minutes without a preview", async () => {
    db.previewDeployment.findUnique.mockResolvedValue(row({ createdAt: new Date(Date.now() - 16 * 60_000) }));
    resolve.mockResolvedValue({ state: "pending" });

    expect(await advancePreviewDeployment("pd1")).toBe("failed");
    expect(upsertCheckRun).toHaveBeenCalledWith("p1", expect.objectContaining({ conclusion: "neutral" }));
  });

  it("leaves terminal rows alone", async () => {
    db.previewDeployment.findUnique.mockResolvedValue(row({ status: "ready" }));
    expect(await advancePreviewDeployment("pd1")).toBe("ready");
    expect(resolve).not.toHaveBeenCalled();
  });
});
