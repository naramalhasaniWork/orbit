import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const transport = vi.hoisted(() => ({ pinnedRequest: vi.fn() }));
vi.mock("@/lib/utils/ssrf-transport", () => transport);
vi.mock("dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));

const db = vi.hoisted(() => ({
  providerConfig: { findUnique: vi.fn() },
  project: { findUniqueOrThrow: vi.fn(async () => ({ workspaceId: "ws-1" })) },
}));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/server/http/session", async () => (await import("../helpers/route-auth")).sessionMock());
vi.mock("@/server/http/auth", async (orig) =>
  (await import("../helpers/route-auth")).authMock(await orig<Record<string, unknown>>())
);
vi.mock("@/lib/vault", () => ({ decrypt: vi.fn(() => "sk-secret-key"), encrypt: vi.fn() }));
vi.mock("@/lib/ai/tracked-completion", () => ({
  createTrackedCompletion: vi.fn(async () => ({
    content: JSON.stringify({
      requiresUi: false,
      requests: [{ method: "GET", path: "/health", expectStatus: [200], description: "d" }],
    }),
  })),
}));
vi.mock("@/lib/ai/model-router", () => ({ getModelForTask: vi.fn(() => "m") }));

import { resetRouteAuth } from "../helpers/route-auth";
import { POST as testProvider } from "@/app/api/workspaces/[workspaceId]/providers/[provider]/test/route";
import { sendFailureAlert } from "@/services/reporting/integrations/slack";
import { executeApiTestCase } from "@/services/execution/api-test-executor";

beforeEach(() => {
  vi.clearAllMocks();
  resetRouteAuth();
  transport.pinnedRequest.mockResolvedValue(new Response("ok", { status: 200 }));
});

describe("provider test route", () => {
  const call = (provider: string, baseUrl: string | null) => {
    db.providerConfig.findUnique.mockResolvedValue({ apiKeyEncrypted: "iv:enc", baseUrl });
    return testProvider(new NextRequest("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ workspaceId: "ws-1", provider }),
    });
  };

  it.each(["custom", "openai", "anthropic", "openrouter"])(
    "refuses a %s base URL on the metadata address and never sends the API key",
    async (provider) => {
      const res = await call(provider, "http://169.254.169.254");
      expect(res.status).toBe(400);
      expect((await res.json()).error.message).toContain("Base URL is not allowed");
      expect(transport.pinnedRequest).not.toHaveBeenCalled();
    }
  );

  it("sends the key to a public base URL, without following redirects", async () => {
    transport.pinnedRequest.mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "http://10.0.0.1/" } })
    );
    const res = await call("custom", "https://llm.example.com");
    expect(res.status).toBe(200);
    expect(transport.pinnedRequest).toHaveBeenCalledTimes(1);
    expect((await res.json()).data.success).toBe(false);
  });
});

describe("slack webhook", () => {
  const failure = { testName: "t", severity: "critical", errorMessage: "e", steps: [] } as never;

  it("will not post to an internal address", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await sendFailureAlert("http://localhost:6379/hook", failure);
    expect(result.success).toBe(false);
    expect(transport.pinnedRequest).not.toHaveBeenCalled();
  });

  it("posts to a public webhook and does not follow a redirect", async () => {
    transport.pinnedRequest.mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://127.0.0.1/" } }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await sendFailureAlert("https://hooks.slack.com/services/T/B/x", failure);
    expect(transport.pinnedRequest).toHaveBeenCalledTimes(1);
  });
});

describe("api test executor", () => {
  const testCase = {
    id: "tc-12345678",
    projectId: "p1",
    name: "health",
    steps: [{ action: "GET /health", expected: "200" }],
  } as never;

  it("does not request an environment URL that points at an internal address", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await executeApiTestCase("run-1", testCase, "http://169.254.169.254", {});
    expect(transport.pinnedRequest).not.toHaveBeenCalled();
    expect(result?.steps[0].status).toBe("failed");
    expect(result?.steps[0].actual).toContain("blocked");
  });

  it("requests a public environment and reports a redirect instead of following it", async () => {
    transport.pinnedRequest.mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "http://10.0.0.1/" } })
    );
    vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await executeApiTestCase("run-1", testCase, "https://staging.example.com", {});
    expect(transport.pinnedRequest).toHaveBeenCalledTimes(1);
    expect(result?.steps[0].actual).toContain("status 302");
  });
});
