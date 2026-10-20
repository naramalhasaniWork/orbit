import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

process.env.ENCRYPTION_KEY = "c".repeat(64);

let projectSettings: Record<string, unknown>;
let delivery: Record<string, unknown> | null;
const deliveryCreate = vi.fn();
const deliveryUpdate = vi.fn();

vi.mock("@/lib/db", async () => {
  const { Prisma } = await import("@/generated/prisma/client");
  return { prisma: {
    project: {
      findFirst: vi.fn(async () => ({ id: "p1", settings: projectSettings })),
      findUnique: vi.fn(async () => ({ id: "p1", settings: projectSettings })),
      findMany: vi.fn(async () => [{ id: "p1", settings: projectSettings }]),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (data.settings) projectSettings = data.settings as Record<string, unknown>;
        return { id: "p1", settings: projectSettings };
      }),
    },
    webhookDelivery: {
      findFirst: vi.fn(async () => delivery),
      create: (...a: unknown[]) => deliveryCreate(...a),
      update: (...a: unknown[]) => deliveryUpdate(...a),
    },
    systemMapNode: { count: vi.fn(async () => 0) },
    systemMapEdge: { count: vi.fn(async () => 0) },
    // The atomic settings patch (server/data/json-patch.ts)
    $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const [patch, remove] = Prisma.sql(strings, ...values).values as [string, string[]];
      projectSettings = { ...projectSettings, ...JSON.parse(patch) };
      for (const key of remove) delete projectSettings[key];
      return 1;
    }),
  } };
});
vi.mock("@/lib/queue/queues", () => ({
  getIndexingQueue: () => ({ getActive: async () => [], getWaiting: async () => [], getFailed: async () => [] }),
}));
vi.mock("@/server/http/session", async () => (await import("../helpers/route-auth")).sessionMock());
vi.mock("@/server/http/auth", async (orig) =>
  (await import("../helpers/route-auth")).authMock(await orig<Record<string, unknown>>())
);

import { resetRouteAuth, routeAuth } from "../helpers/route-auth";
import { sealSecret } from "@/lib/integrations/secret-field";
import { isAllowedWebhookUrl } from "@/lib/integrations/webhook-url";

// Delivery goes through the DNS-pinned safeFetch; route it to the stubbed global fetch here.
vi.mock("@/lib/utils/ssrf", () => ({
  safeFetch: (url: string, init: RequestInit = {}, opts: { followRedirects?: boolean } = {}) =>
    fetch(url, { ...init, redirect: opts.followRedirects === false ? "manual" : "follow" }),
}));

const pParams = { params: Promise.resolve({ projectId: "p1" }) };
const retryParams = { params: Promise.resolve({ projectId: "p1", deliveryId: "d1" }) };
const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/x", { method, body: body === undefined ? undefined : JSON.stringify(body) });

const sealedHook = {
  id: "h1",
  url: "https://example.com/hook",
  events: ["run.started"],
  secretSealed: sealSecret("whsec_abc"),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  resetRouteAuth();
  routeAuth.workspaceId = "w1";
  projectSettings = {
    webhooks: [sealedHook],
    slackWebhookUrl: "https://hooks.slack.com/services/T/B/X",
    linearApiKey: sealSecret("lin_key"),
    customRules: ["a"],
  };
  delivery = { id: "d1", url: sealedHook.url, event: "run.started", payload: { a: 1 }, attempts: 1 };
});

describe("generic project settings cannot touch integration credentials", () => {
  it("PATCH drops protected keys and keeps existing values", async () => {
    const { PATCH } = await import("@/app/api/projects/[projectId]/route");
    const before = projectSettings;
    const res = await PATCH(
      req("PATCH", {
        settings: {
          customRules: ["b"],
          webhooks: [{ id: "evil", url: "https://attacker.example", events: ["run.started"], secret: "x" }],
          slackWebhookUrl: "https://hooks.slack.com/services/EVIL",
          linearApiKey: "attacker",
        },
      }),
      pParams
    );
    expect(res.status).toBe(200);
    expect(projectSettings.customRules).toEqual(["b"]);
    expect(projectSettings.webhooks).toEqual(before.webhooks);
    expect(projectSettings.slackWebhookUrl).toBe("https://hooks.slack.com/services/T/B/X");
    expect(projectSettings.linearApiKey).toEqual(before.linearApiKey);
  });

  it("GET, PATCH and list responses never include credentials or webhook secrets", async () => {
    const { GET, PATCH } = await import("@/app/api/projects/[projectId]/route");
    const list = await import("@/app/api/projects/route");
    const responses = [
      await GET(req("GET"), pParams),
      await PATCH(req("PATCH", { name: "n" }), pParams),
      await list.GET(new NextRequest("http://localhost/api/projects")),
    ];
    for (const res of responses) {
      const text = JSON.stringify(await res.json());
      expect(text).not.toContain("secretSealed");
      expect(text).not.toContain("hooks.slack.com");
      expect(text).not.toContain("linearApiKey");
      expect(text).toContain("example.com/hook");
    }
  });
});

describe("webhook retry route", () => {
  it("requires integrations.manage", async () => {
    routeAuth.role = "viewer"; // viewers hold integrations.view only
    const { POST } = await import("@/app/api/projects/[projectId]/webhook-deliveries/[deliveryId]/retry/route");
    expect((await POST(req("POST"), retryParams)).status).toBe(403);
  });

  it("refuses with 409 when the endpoint is gone or its secret is unresolvable", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/projects/[projectId]/webhook-deliveries/[deliveryId]/retry/route");

    projectSettings = { webhooks: [] };
    expect((await POST(req("POST"), retryParams)).status).toBe(409);

    projectSettings = { webhooks: [{ ...sealedHook, secretSealed: { encrypted: "00", iv: "00" } }] };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await POST(req("POST"), retryParams)).status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses private URLs, does not follow redirects and truncates stored bodies", async () => {
    const fetchMock = vi.fn(async () => new Response("x".repeat(2000), { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/projects/[projectId]/webhook-deliveries/[deliveryId]/retry/route");

    await POST(req("POST"), retryParams);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0][1].redirect).toBe("manual");
    expect(calls[0][1].body).toBe(JSON.stringify({ a: 1 }));
    const stored = deliveryUpdate.mock.calls[0][0].data.response as string;
    expect(stored.length).toBeLessThanOrEqual(500);

    fetchMock.mockClear();
    projectSettings = { webhooks: [{ ...sealedHook, url: "https://127.0.0.1/hook" }] };
    delivery = { ...delivery, url: "https://127.0.0.1/hook" };
    expect((await POST(req("POST"), retryParams)).status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("delivery-time checks", () => {
  it("treats trailing-dot hosts like their dotless form", () => {
    expect(isAllowedWebhookUrl("https://localhost./x")).toBe(false);
    expect(isAllowedWebhookUrl("https://127.0.0.1./x")).toBe(false);
    expect(isAllowedWebhookUrl("https://example.com./x")).toBe(true);
  });

  it("dispatcher skips disallowed URLs and never follows redirects", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 302 }));
    vi.stubGlobal("fetch", fetchMock);
    const { dispatchRunStarted } = await import("@/services/reporting/integrations/outbound-webhooks");
    vi.spyOn(console, "warn").mockImplementation(() => {});

    projectSettings = {
      webhooks: [
        { ...sealedHook, id: "a", url: "https://169.254.169.254/latest" },
        { ...sealedHook, id: "b", url: "https://example.com/hook" },
      ],
    };
    await dispatchRunStarted("p1", { runId: "r", mode: "full", trigger: "manual" });

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls.map((c) => c[0])).toEqual(["https://example.com/hook"]);
    expect(calls[0][1].redirect).toBe("manual");
    expect(calls).toHaveLength(1); // 302 is not retried
  });
});
