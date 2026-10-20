import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

process.env.ENCRYPTION_KEY = "b".repeat(64);

vi.mock("@/lib/db", async () => ({
  prisma: (await import("../helpers/fake-config-db")).createFakeConfigDb().prisma,
}));

vi.mock("@/server/http/session", async () => (await import("../helpers/route-auth")).sessionMock());
vi.mock("@/server/http/auth", async (orig) =>
  (await import("../helpers/route-auth")).authMock(await orig<Record<string, unknown>>())
);
vi.mock("@/lib/auth/audit", () => ({ auditSettingsChange: vi.fn() }));

import { resetRouteAuth, routeAuth } from "../helpers/route-auth";
import { fakeOf } from "../helpers/fake-config-db";
import { prisma } from "@/lib/db";
import { openSecret, sealSecret } from "@/lib/integrations/secret-field";

const db = fakeOf(prisma);

// Delivery goes through the DNS-pinned safeFetch; route it to the stubbed global fetch here.
vi.mock("@/lib/utils/ssrf", () => ({
  safeFetch: (url: string, init: RequestInit = {}, opts: { followRedirects?: boolean } = {}) =>
    fetch(url, { ...init, redirect: opts.followRedirects === false ? "manual" : "follow" }),
}));

const wsParams = { params: Promise.resolve({ workspaceId: "w1" }) };

function req(method: string, body?: unknown) {
  return new NextRequest("http://localhost/api/x", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const row = (provider: string) => db.integrations.find((r) => r.provider === provider);

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  db.reset();
  db.addWorkspace("w1");
  db.addProject("p1", "w1");
  resetRouteAuth();
  routeAuth.workspaceId = "w1";
});

describe("slack integration route", () => {
  const url = "https://hooks.slack.com/services/T000/B000/XXXX";

  it("persists the webhook URL the reporter reads", async () => {
    const { POST } = await import("@/app/api/workspaces/[workspaceId]/integrations/slack/route");
    const res = await POST(req("POST", { webhookUrl: url }), wsParams);
    expect(res.status).toBe(200);
    // Stored sealed in IntegrationConfig, never as plaintext, and not in settings any more
    expect(JSON.stringify(row("slack"))).not.toContain(url);
    expect(openSecret(row("slack")?.credentialsSealed)).toBe(url);
    expect(row("slack")).toMatchObject({ status: "connected" });
    expect(db.workspaces[0].settings).toEqual({});
  });

  it("rejects non-Slack URLs", async () => {
    const { POST } = await import("@/app/api/workspaces/[workspaceId]/integrations/slack/route");
    const res = await POST(req("POST", { webhookUrl: "https://evil.example.com/x" }), wsParams);
    expect(res.status).toBe(400);
    expect(row("slack")).toBeUndefined();
  });

  it("requires settings.manage", async () => {
    routeAuth.role = "viewer";
    const { POST } = await import("@/app/api/workspaces/[workspaceId]/integrations/slack/route");
    const res = await POST(req("POST", { webhookUrl: url }), wsParams);
    expect(res.status).toBe(403);
  });

  it("updates preferences and disconnects", async () => {
    const { POST, PATCH, DELETE } = await import(
      "@/app/api/workspaces/[workspaceId]/integrations/slack/route"
    );
    await POST(req("POST", { webhookUrl: url }), wsParams);
    const prefs = { runCompleted: false, testFailed: true };
    const patched = await PATCH(req("PATCH", { notifications: prefs }), wsParams);
    expect(patched.status).toBe(200);
    expect(row("slack")?.settings).toMatchObject({ provider: "slack", notifications: prefs });

    await DELETE(req("DELETE"), wsParams);
    expect(row("slack")).toMatchObject({ status: "disconnected", credentialsSealed: null });
  });

  it("refuses preference changes when not connected", async () => {
    const { PATCH } = await import("@/app/api/workspaces/[workspaceId]/integrations/slack/route");
    const res = await PATCH(
      req("PATCH", { notifications: { runCompleted: true, testFailed: true } }),
      wsParams
    );
    expect(res.status).toBe(409);
  });

  it("a legacy settings connection is copied into the table before its preferences change", async () => {
    db.workspaces[0].settings = { slackWebhookUrl: sealSecret(url), slack: { connected: true } };
    const { PATCH } = await import("@/app/api/workspaces/[workspaceId]/integrations/slack/route");
    const res = await PATCH(req("PATCH", { notifications: { runCompleted: false, testFailed: false } }), wsParams);
    expect(res.status).toBe(200);
    expect(openSecret(row("slack")?.credentialsSealed)).toBe(url);
    expect(row("slack")?.settings).toMatchObject({ notifications: { runCompleted: false, testFailed: false } });
  });
});

describe("linear integration route", () => {
  function mockLinear(teams: Array<{ id: string; name: string }> | "error") {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify(
            teams === "error"
              ? { errors: [{ message: "Authentication required" }] }
              : { data: { teams: { nodes: teams } } }
          ),
          { status: 200 }
        )
      )
    );
  }

  it("stores the API key encrypted and the team id linear.ts reads", async () => {
    mockLinear([{ id: "team-1", name: "Eng" }]);
    const { POST } = await import("@/app/api/workspaces/[workspaceId]/integrations/linear/route");
    const res = await POST(req("POST", { apiKey: "lin_api_secret" }), wsParams);
    expect(res.status).toBe(200);

    expect(JSON.stringify(row("linear"))).not.toContain("lin_api_secret");
    expect(openSecret(row("linear")?.credentialsSealed)).toBe("lin_api_secret");
    expect(row("linear")).toMatchObject({ status: "connected", externalAccountId: "team-1", displayName: "Eng" });
    expect(row("linear")?.settings).toMatchObject({ provider: "linear", autoCreateIssues: true });
  });

  it("rejects a key Linear refuses", async () => {
    mockLinear("error");
    const { POST } = await import("@/app/api/workspaces/[workspaceId]/integrations/linear/route");
    const res = await POST(req("POST", { apiKey: "bad" }), wsParams);
    expect(res.status).toBe(400);
    expect(row("linear")).toBeUndefined();
  });

  it("disconnect removes the credentials", async () => {
    mockLinear([{ id: "team-1", name: "Eng" }]);
    const { POST, DELETE } = await import(
      "@/app/api/workspaces/[workspaceId]/integrations/linear/route"
    );
    await POST(req("POST", { apiKey: "k" }), wsParams);
    await DELETE(req("DELETE"), wsParams);
    expect(row("linear")).toMatchObject({ status: "disconnected", credentialsSealed: null, externalAccountId: null });

    const { getLinearConfig } = await import("@/services/reporting/integrations/linear");
    expect(await getLinearConfig("p1")).toBeNull();
  });

  it("linear.ts decrypts the stored key when filing issues", async () => {
    mockLinear([{ id: "team-1", name: "Eng" }]);
    const { POST } = await import("@/app/api/workspaces/[workspaceId]/integrations/linear/route");
    await POST(req("POST", { apiKey: "lin_api_secret" }), wsParams);

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: { issueCreate: { success: true, issue: { id: "i1", url: "u", identifier: "E-1" } } },
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const { createBugIssue } = await import("@/services/reporting/integrations/linear");
    const result = await createBugIssue(
      {
        title: "t",
        severity: "high",
        description: "d",
        stepsToReproduce: ["a"],
        expectedBehavior: "e",
        actualBehavior: "a",
        screenshotUrls: [],
      } as never,
      "p1"
    );

    expect(result.success).toBe(true);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect((calls[0][1].headers as Record<string, string>).Authorization).toBe("lin_api_secret");
  });
});

describe("project webhooks routes", () => {
  const pParams = { params: Promise.resolve({ projectId: "p1" }) };

  it("creates, lists (without secret), toggles and deletes", async () => {
    const { GET, POST } = await import("@/app/api/projects/[projectId]/webhooks/route");
    const { PATCH, DELETE } = await import(
      "@/app/api/projects/[projectId]/webhooks/[webhookId]/route"
    );

    const created = await POST(
      req("POST", { url: "https://example.com/hook", events: ["run.completed"] }),
      pParams
    );
    expect(created.status).toBe(201);
    const { data } = await created.json();
    expect(data.secret).toMatch(/^whsec_/);

    const stored = db.endpoints[0];
    expect(stored).toMatchObject({ id: data.endpoint.id, workspaceId: "w1", projectId: "p1" });
    expect(JSON.stringify(stored)).not.toContain(data.secret);
    expect(openSecret(stored.secretSealed)).toBe(data.secret);

    const listed = await (await GET(req("GET"), pParams)).json();
    expect(listed.data).toEqual([
      { id: data.endpoint.id, url: "https://example.com/hook", events: ["run.completed"], isEnabled: true },
    ]);

    const idParams = { params: Promise.resolve({ projectId: "p1", webhookId: data.endpoint.id }) };
    await PATCH(req("PATCH", { isEnabled: false }), idParams);
    expect(db.endpoints[0].isEnabled).toBe(false);

    const missing = await DELETE(req("DELETE"), {
      params: Promise.resolve({ projectId: "p1", webhookId: "00000000-0000-4000-8000-000000000000" }),
    });
    expect(missing.status).toBe(404);
    await DELETE(req("DELETE"), idParams);
    expect(db.endpoints).toEqual([]);
    expect(db.projects[0].settings).not.toHaveProperty("webhooks");
  });

  it("concurrent creates both survive (the settings.webhooks lost update is gone)", async () => {
    const { GET, POST } = await import("@/app/api/projects/[projectId]/webhooks/route");
    await Promise.all([
      POST(req("POST", { url: "https://example.com/a", events: ["run.completed"] }), pParams),
      POST(req("POST", { url: "https://example.com/b", events: ["run.failed"] }), pParams),
    ]);
    const listed = await (await GET(req("GET"), pParams)).json();
    expect(listed.data.map((e: { url: string }) => e.url).sort()).toEqual(["https://example.com/a", "https://example.com/b"]);
  });

  it("legacy settings.webhooks are listed from the table with their ids and sealed secrets", async () => {
    const id = "6f1c1d1e-0000-4000-8000-0000000000aa";
    db.projects[0].settings = { webhooks: [{ id, url: "https://example.com/old", events: ["run.started"], secret: "plain" }] };
    const { GET } = await import("@/app/api/projects/[projectId]/webhooks/route");
    const listed = await (await GET(req("GET"), pParams)).json();
    expect(listed.data).toEqual([{ id, url: "https://example.com/old", events: ["run.started"], isEnabled: true }]);
    expect(openSecret(db.endpoints[0].secretSealed)).toBe("plain");
    expect(db.endpoints[0].secretSealed).toHaveProperty("iv");
  });

  it("rejects private URLs and unknown events", async () => {
    const { POST } = await import("@/app/api/projects/[projectId]/webhooks/route");
    const bad = await POST(req("POST", { url: "https://127.0.0.1/x", events: ["run.completed"] }), pParams);
    expect(bad.status).toBe(400);
    const badEvent = await POST(req("POST", { url: "https://example.com/x", events: ["nope"] }), pParams);
    expect(badEvent.status).toBe(400);
  });

  it("dispatcher delivers a signed body to a sealed-secret endpoint", async () => {
    const { POST } = await import("@/app/api/projects/[projectId]/webhooks/route");
    const created = await (
      await POST(req("POST", { url: "https://example.com/hook", events: ["run.started"] }), pParams)
    ).json();

    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { dispatchRunStarted, signPayload } = await import(
      "@/services/reporting/integrations/outbound-webhooks"
    );
    await dispatchRunStarted("p1", { runId: "r1", mode: "full", trigger: "manual" });

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const init = calls[0][1];
    expect(typeof init.body).toBe("string");
    expect((init.headers as Record<string, string>)["X-Orbit-Signature"]).toBe(
      `sha256=${signPayload(init.body as string, created.data.secret)}`
    );
  });
});
