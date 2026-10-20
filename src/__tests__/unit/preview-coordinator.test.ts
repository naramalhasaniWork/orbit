import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  previewDeployment: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn(), create: vi.fn() },
  previewConnection: { findUnique: vi.fn() },
  previewBinding: { findUnique: vi.fn() },
  environment: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: db }));
const launchPipelineRun = vi.hoisted(() => vi.fn());
vi.mock("@/services/orchestrator/run-launcher", () => ({ launchPipelineRun }));
const cancelRun = vi.hoisted(() => vi.fn());
vi.mock("@/services/orchestrator/run-manager", () => ({ cancelRun }));
const upsertCheckRun = vi.hoisted(() => vi.fn());
const findOpenPullRequestsForCommit = vi.hoisted(() => vi.fn());
vi.mock("@/services/reporting/integrations/github-checks", () => ({ upsertCheckRun, findOpenPullRequestsForCommit }));
const resolve = vi.hoisted(() => vi.fn());
vi.mock("@/services/preview/registry", () => ({ getPreviewProvider: () => ({ id: "railway", resolve }) }));
vi.mock("@/services/preview/connections", () => ({ connectionAccess: () => ({ token: "t", config: {} }) }));
vi.mock("@/lib/utils/ssrf", () => ({ assertPublicUrl: vi.fn().mockResolvedValue(undefined), UnsafeUrlError: Error }));

import { advancePreviewDeployment, closePreviewsForPullRequest, handleProviderSignal } from "@/services/preview/coordinator";
import type { PreviewHint } from "@/services/preview/types";

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
    db.previewDeployment.findMany.mockResolvedValue([]);
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

  it("cancels a run still going for an older commit before re-pointing the PR's environment", async () => {
    db.previewDeployment.findUnique.mockResolvedValue(row());
    db.previewDeployment.findMany.mockResolvedValue([{ runId: "run-old" }]);
    resolve.mockResolvedValue({ state: "ready", url: "https://web-pr-42.up.railway.app", externalId: "dep-2" });

    await advancePreviewDeployment("pd1");

    expect(db.previewDeployment.findMany).toHaveBeenCalledWith({
      where: { bindingId: "b1", prNumber: 42, runId: { not: null }, NOT: { commitSha: "abc" } },
      select: { runId: true },
    });
    expect(cancelRun).toHaveBeenCalledWith("run-old");
    expect(cancelRun.mock.invocationCallOrder[0]).toBeLessThan(db.environment.create.mock.invocationCallOrder[0]);
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

describe("closePreviewsForPullRequest", () => {
  it("ends pending previews with a neutral check and archives the PR's environment", async () => {
    db.previewDeployment.findMany.mockResolvedValue([{ id: "pd1", commitSha: "abc", checkRunId: "check-1" }]);
    db.previewDeployment.updateMany.mockResolvedValue({ count: 1 });

    await closePreviewsForPullRequest("p1", 42);

    expect(db.previewDeployment.updateMany).toHaveBeenCalledWith({
      where: { id: "pd1", status: "pending" },
      data: { status: "gone", error: "Pull request closed" },
    });
    expect(upsertCheckRun).toHaveBeenCalledWith("p1", expect.objectContaining({ checkRunId: "check-1", conclusion: "neutral" }));
    expect(db.environment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ projectId: "p1", source: "preview", sourceId: { endsWith: ":42" } }),
    }));
  });
});

describe("handleProviderSignal with forged webhook bodies", () => {
  const hint: PreviewHint = {
    event: "Deployment.succeeded", externalId: "dep-x", commitSha: "ABC", branch: "feat", isPreview: true,
    refs: { projectId: "rp", environmentId: "attacker-env" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    db.previewConnection.findUnique.mockResolvedValue({
      provider: "railway", credentials: {}, config: {}, bindings: [{ id: "b1", projectId: "p1", targetRef: "rp/rs" }],
    });
  });

  it("does nothing without a commit: no fan-out to every pending row", async () => {
    expect(await handleProviderSignal("c1", { ...hint, commitSha: null })).toEqual({ advanced: 0 });
    expect(db.previewDeployment.findUnique).not.toHaveBeenCalled();
    expect(db.previewDeployment.updateMany).not.toHaveBeenCalled();
  });

  it("does not create a row for an untracked commit the provider API has no deployment for", async () => {
    db.previewDeployment.findUnique.mockResolvedValue(null);
    resolve.mockResolvedValue({ state: "pending" });
    findOpenPullRequestsForCommit.mockResolvedValue([{ number: 9, branch: "feat" }]);

    expect(await handleProviderSignal("c1", hint)).toEqual({ advanced: 0 });
    expect(db.previewDeployment.create).not.toHaveBeenCalled();
    expect(launchPipelineRun).not.toHaveBeenCalled();
  });

  it("a fake 'removed' event with a wrong environment leaves a pending row pending", async () => {
    db.previewDeployment.findUnique
      .mockResolvedValueOnce({ id: "pd1", status: "pending" })
      .mockResolvedValueOnce(row());
    resolve.mockResolvedValue({ state: "pending" }); // the API still sees the build running

    await handleProviderSignal("c1", { ...hint, event: "Environment.deleted" });

    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ commitSha: "abc", hint: expect.objectContaining({ event: "Environment.deleted" }) }));
    expect(db.previewDeployment.updateMany).not.toHaveBeenCalled();
    expect(launchPipelineRun).not.toHaveBeenCalled();
    expect(upsertCheckRun).not.toHaveBeenCalled();
  });
});
