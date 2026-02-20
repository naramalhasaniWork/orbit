import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

vi.mock("@/lib/db", () => ({
  prisma: {
    project: { findFirst: vi.fn() },
    webhookDelivery: { create: vi.fn() },
    testRun: { create: vi.fn() },
  },
}));

vi.mock("@/lib/queue/queues", () => ({
  getIndexingQueue: vi.fn(() => ({ add: vi.fn() })),
}));

vi.mock("@/lib/websocket", () => ({
  emitRunStarted: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

const mockPrisma = prisma as unknown as {
  project: { findFirst: ReturnType<typeof vi.fn> };
  webhookDelivery: { create: ReturnType<typeof vi.fn> };
  testRun: { create: ReturnType<typeof vi.fn> };
};

function makeSignature(body: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

describe("api-webhooks/github", () => {
  const webhookSecret = "test-webhook-secret";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_WEBHOOK_SECRET = webhookSecret;
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
    expect(mockPrisma.testRun.create).toHaveBeenCalled();
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
    expect(mockPrisma.testRun.create).toHaveBeenCalled();
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
