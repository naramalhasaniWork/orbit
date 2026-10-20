import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

vi.mock("@/lib/db", () => ({
  prisma: {
    project: { findFirst: vi.fn(), findUnique: vi.fn() },
    webhookDelivery: { create: vi.fn() },
    testRun: { create: vi.fn(), delete: vi.fn() },
    environment: { findFirst: vi.fn() },
    previewBinding: { findUnique: vi.fn() },
    previewDeployment: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));

const upsertCheckRun = vi.fn();
vi.mock("@/services/reporting/integrations/github-checks", () => ({
  upsertCheckRun: (...args: unknown[]) => upsertCheckRun(...args),
  findOpenPullRequestsForCommit: vi.fn().mockResolvedValue([]),
}));

const indexingAdd = vi.fn();
vi.mock("@/lib/queue/queues", () => ({
  getIndexingQueue: vi.fn(() => ({ add: indexingAdd })),
}));

vi.mock("@/lib/auth/tenant", () => ({
  canConsume: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("@/lib/websocket", () => ({
  emitRunStarted: vi.fn(),
}));

vi.mock("@/services/reporting/integrations/outbound-webhooks", () => ({
  dispatchRunStarted: vi.fn(),
}));

vi.mock("@/services/mention-handler", () => ({
  handleMention: vi.fn(),
  ORBIT_MENTION_PATTERN: /@orbit(?:-testing)?(?:\[bot\])?\s*/i,
}));

vi.mock("@/services/github-installation-sync", () => ({
  handleInstallationEvent: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

const mockPrisma = prisma as unknown as {
  project: { findFirst: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
  webhookDelivery: { create: ReturnType<typeof vi.fn> };
  testRun: { create: ReturnType<typeof vi.fn> };
  environment: { findFirst: ReturnType<typeof vi.fn> };
  previewBinding: { findUnique: ReturnType<typeof vi.fn> };
  previewDeployment: Record<"findUnique" | "create" | "update", ReturnType<typeof vi.fn>>;
};

function makeSignature(body: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

describe("api-webhooks/github", () => {
  const webhookSecret = "test-webhook-secret";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_WEBHOOK_SECRET = webhookSecret;
    mockPrisma.project.findUnique.mockResolvedValue({ workspaceId: "ws-1" });
    mockPrisma.environment.findFirst.mockResolvedValue({ id: "env-default" });
    mockPrisma.previewBinding.findUnique.mockResolvedValue(null);
  });

  it("fails closed with 503 when the webhook secret is not configured", async () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    const body = JSON.stringify({ repository: { html_url: "https://github.com/org/repo" } });

    const { POST } = await import("@/app/api/webhooks/github/route");
    const request = new NextRequest("http://localhost/api/webhooks/github", {
      method: "POST",
      body,
      headers: { "x-github-event": "push", "content-type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(503);
    expect(mockPrisma.project.findFirst).not.toHaveBeenCalled();
  });

  it("rejects invalid HMAC signature", async () => {
    const body = JSON.stringify({ repository: { html_url: "https://github.com/org/repo" } });

    const { POST } = await import("@/app/api/webhooks/github/route");
    const request = new NextRequest("http://localhost/api/webhooks/github", {
      method: "POST",
      body,
      headers: {
        "x-hub-signature-256": "sha256=invalid",
        "x-github-event": "push",
        "content-type": "application/json",
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("accepts valid HMAC signature", async () => {
    const payload = {
      repository: { html_url: "https://github.com/org/repo" },
    };
    const body = JSON.stringify(payload);
    const signature = makeSignature(body, webhookSecret);

    mockPrisma.project.findFirst.mockResolvedValue(null);

    const { POST } = await import("@/app/api/webhooks/github/route");
    const request = new NextRequest("http://localhost/api/webhooks/github", {
      method: "POST",
      body,
      headers: {
        "x-hub-signature-256": signature,
        "x-github-event": "push",
        "content-type": "application/json",
      },
    });

    const response = await POST(request);
    // Even though project not found, signature passed
    expect(response.status).toBe(404);
  });

  it("handles ping event", async () => {
    const payload = { repository: { html_url: "https://github.com/org/repo" } };
    const body = JSON.stringify(payload);
    const signature = makeSignature(body, webhookSecret);

    mockPrisma.project.findFirst.mockResolvedValue({
      id: "p1",
      defaultBranch: "main",
    });
    mockPrisma.webhookDelivery.create.mockResolvedValue({});

    const { POST } = await import("@/app/api/webhooks/github/route");
    const request = new NextRequest("http://localhost/api/webhooks/github", {
      method: "POST",
      body,
      headers: {
        "x-hub-signature-256": signature,
        "x-github-event": "ping",
        "content-type": "application/json",
      },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(json.status).toBe("pong");
  });

  it("processes push event on main branch", async () => {
    const payload = {
      repository: { html_url: "https://github.com/org/repo" },
      ref: "refs/heads/main",
      commits: [
        { id: "abc123", message: "fix bug", added: ["file1.ts"], removed: [], modified: ["file2.ts"] },
      ],
    };
    const body = JSON.stringify(payload);
    const signature = makeSignature(body, webhookSecret);

    mockPrisma.project.findFirst.mockResolvedValue({
      id: "p1",
      defaultBranch: "main",
    });
    mockPrisma.webhookDelivery.create.mockResolvedValue({});
    mockPrisma.testRun.create.mockResolvedValue({
      id: "run-1",
      mode: "targeted",
      trigger: "push",
    });

    const { POST } = await import("@/app/api/webhooks/github/route");
    const request = new NextRequest("http://localhost/api/webhooks/github", {
      method: "POST",
      body,
      headers: {
        "x-hub-signature-256": signature,
        "x-github-event": "push",
        "content-type": "application/json",
      },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(json.status).toBe("push_processed");
    expect(json.branch).toBe("main");
    expect(json.runId).toBe("run-1");
    // The indexing job carries the runId so the run continues to plan → execute
    expect(indexingAdd).toHaveBeenCalledWith(
      "run-run-1",
      expect.objectContaining({
        projectId: "p1",
        runId: "run-1",
        changedFiles: ["file1.ts", "file2.ts"],
      }),
      { jobId: "run-run-1" }
    );
  });

  it("processes pull_request opened event", async () => {
    const payload = {
      repository: { html_url: "https://github.com/org/repo" },
      action: "opened",
      pull_request: {
        number: 42,
        head: { ref: "feature/new-feature" },
        title: "Add new feature",
      },
    };
    const body = JSON.stringify(payload);
    const signature = makeSignature(body, webhookSecret);

    mockPrisma.project.findFirst.mockResolvedValue({
      id: "p1",
      defaultBranch: "main",
    });
    mockPrisma.webhookDelivery.create.mockResolvedValue({});
    mockPrisma.testRun.create.mockResolvedValue({
      id: "run-2",
      mode: "targeted",
      trigger: "pr",
    });

    const { POST } = await import("@/app/api/webhooks/github/route");
    const request = new NextRequest("http://localhost/api/webhooks/github", {
      method: "POST",
      body,
      headers: {
        "x-hub-signature-256": signature,
        "x-github-event": "pull_request",
        "content-type": "application/json",
      },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(json.status).toBe("pr_processed");
    expect(json.action).toBe("opened");
    // Without a preview binding the run gets the project's default environment, not none.
    expect(mockPrisma.testRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ mode: "targeted", trigger: "pr", prNumber: 42, environmentId: "env-default" }),
    });
    expect(indexingAdd).toHaveBeenCalledWith(
      "run-run-2",
      expect.objectContaining({ runId: "run-2", branch: "feature/new-feature" }),
      { jobId: "run-run-2" }
    );
  });

  it("waits for the preview instead of starting a run when the project has a preview binding", async () => {
    const payload = {
      repository: { html_url: "https://github.com/org/repo", full_name: "org/repo" },
      action: "synchronize",
      pull_request: {
        number: 7,
        head: { ref: "feat", sha: "ABC123", repo: { full_name: "org/repo" } },
        base: { repo: { full_name: "org/repo" } },
        title: "Feat",
      },
    };
    const body = JSON.stringify(payload);
    mockPrisma.project.findFirst.mockResolvedValue({ id: "p1", defaultBranch: "main" });
    mockPrisma.webhookDelivery.create.mockResolvedValue({});
    mockPrisma.previewBinding.findUnique.mockResolvedValue({ id: "b1" });
    mockPrisma.previewDeployment.findUnique.mockResolvedValue(null);
    mockPrisma.previewDeployment.create.mockResolvedValue({ id: "pd1", status: "pending" });
    upsertCheckRun.mockResolvedValue("check-1");

    const { POST } = await import("@/app/api/webhooks/github/route");
    const response = await POST(
      new NextRequest("http://localhost/api/webhooks/github", {
        method: "POST",
        body,
        headers: {
          "x-hub-signature-256": makeSignature(body, webhookSecret),
          "x-github-event": "pull_request",
          "content-type": "application/json",
        },
      })
    );
    const json = await response.json();

    expect(json).toMatchObject({ status: "preview_pending", previewDeploymentId: "pd1" });
    expect(mockPrisma.testRun.create).not.toHaveBeenCalled();
    expect(mockPrisma.previewDeployment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ bindingId: "b1", commitSha: "abc123", prNumber: 7, status: "pending" }),
      select: { id: true, status: true },
    });
    expect(upsertCheckRun).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ name: "Orbit preview", status: "in_progress", title: "Waiting for preview" })
    );
  });

  it("ignores push to non-main branch", async () => {
    const payload = {
      repository: { html_url: "https://github.com/org/repo" },
      ref: "refs/heads/feature/wip",
      commits: [],
    };
    const body = JSON.stringify(payload);
    const signature = makeSignature(body, webhookSecret);

    mockPrisma.project.findFirst.mockResolvedValue({ id: "p1", defaultBranch: "main" });
    mockPrisma.webhookDelivery.create.mockResolvedValue({});

    const { POST } = await import("@/app/api/webhooks/github/route");
    const request = new NextRequest("http://localhost/api/webhooks/github", {
      method: "POST",
      body,
      headers: {
        "x-hub-signature-256": signature,
        "x-github-event": "push",
        "content-type": "application/json",
      },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(json.status).toBe("push_processed");
    expect(mockPrisma.testRun.create).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON body", async () => {
    const body = "not valid json";
    const signature = makeSignature(body, webhookSecret);

    const { POST } = await import("@/app/api/webhooks/github/route");
    const request = new NextRequest("http://localhost/api/webhooks/github", {
      method: "POST",
      body,
      headers: {
        "x-hub-signature-256": signature,
        "x-github-event": "push",
        "content-type": "application/json",
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 400 when no repository URL in payload", async () => {
    const payload = { action: "opened" };
    const body = JSON.stringify(payload);
    const signature = makeSignature(body, webhookSecret);

    const { POST } = await import("@/app/api/webhooks/github/route");
    const request = new NextRequest("http://localhost/api/webhooks/github", {
      method: "POST",
      body,
      headers: {
        "x-hub-signature-256": signature,
        "x-github-event": "push",
        "content-type": "application/json",
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
