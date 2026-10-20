import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

process.env.ENCRYPTION_KEY = "b".repeat(64);

let workspaceSettings: Record<string, unknown>;
let projectSettings: Record<string, unknown>;

vi.mock("@/lib/db", () => ({
  prisma: {
    workspace: {
      findUnique: vi.fn(async () => ({ settings: workspaceSettings })),
      update: vi.fn(async ({ data }: { data: { settings: Record<string, unknown> } }) => {
        workspaceSettings = data.settings;
      }),
    },
    project: {
      findFirst: vi.fn(async () => ({ id: "p1", settings: projectSettings })),
      findUnique: vi.fn(async () => ({ id: "p1", settings: projectSettings })),
      update: vi.fn(async ({ data }: { data: { settings: Record<string, unknown> } }) => {
        projectSettings = data.settings;
      }),
    },
    webhookDelivery: { create: vi.fn() },
  },
}));

const requirePermission = vi.fn();
vi.mock("@/lib/auth/rbac", () => ({
  requirePermission: (...args: unknown[]) => requirePermission(...args),
}));
vi.mock("@/lib/auth/audit", () => ({ auditSettingsChange: vi.fn() }));
vi.mock("@/lib/utils/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/utils/api")>()),
  requireWorkspace: vi.fn(async () => ({ workspaceId: "w1" })),
}));

import { AuthError } from "@/lib/utils/api";
import { openSecret } from "@/lib/integrations/secret-field";

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

beforeEach(() => {
  vi.clearAllMocks();
  workspaceSettings = {};
  projectSettings = {};
  requirePermission.mockResolvedValue({ session: { user: { id: "u1" } } });
});

describe("slack integration route", () => {
  const url = "https://hooks.slack.com/services/T000/B000/XXXX";

  it("persists the webhook URL the reporter reads", async () => {
    const { POST } = await import("@/app/api/workspaces/[workspaceId]/integrations/slack/route");
    const res = await POST(req("POST", { webhookUrl: url }), wsParams);
    expect(res.status).toBe(200);
    // Stored sealed, never as plaintext; the reporter opens it with openSecret
    expect(workspaceSettings.slackWebhookUrl).not.toBe(url);
    expect(openSecret(workspaceSettings.slackWebhookUrl)).toBe(url);
    expect(workspaceSettings.slack).toMatchObject({ connected: true });
  });

  it("rejects non-Slack URLs", async () => {
    const { POST } = await import("@/app/api/workspaces/[workspaceId]/integrations/slack/route");
    const res = await POST(req("POST", { webhookUrl: "https://evil.example.com/x" }), wsParams);
    expect(res.status).toBe(400);
    expect(workspaceSettings.slackWebhookUrl).toBeUndefined();
  });

  it("requires settings.manage", async () => {
    requirePermission.mockRejectedValue(new AuthError("denied", "FORBIDDEN", 403));
    const { POST } = await import("@/app/api/workspaces/[workspaceId]/integrations/slack/route");
    const res = await POST(req("POST", { webhookUrl: url }), wsParams);
    expect(res.status).toBe(403);
    expect(requirePermission).toHaveBeenCalledWith("w1", "settings.manage");
  });

  it("updates preferences and disconnects", async () => {
    const { POST, PATCH, DELETE } = await import(
      "@/app/api/workspaces/[workspaceId]/integrations/slack/route"
    );
    await POST(req("POST", { webhookUrl: url }), wsParams);
    const prefs = { runCompleted: false, testFailed: true };
    await PATCH(req("PATCH", { notifications: prefs }), wsParams);
    expect(workspaceSettings.slack).toMatchObject({ notifications: prefs });

    await DELETE(req("DELETE"), wsParams);
    expect(workspaceSettings.slackWebhookUrl).toBeUndefined();
    expect(workspaceSettings.slack).toEqual({ connected: false });
  });

  it("refuses preference changes when not connected", async () => {
    const { PATCH } = await import("@/app/api/workspaces/[workspaceId]/integrations/slack/route");
    const res = await PATCH(
      req("PATCH", { notifications: { runCompleted: true, testFailed: true } }),
      wsParams
    );
    expect(res.status).toBe(409);
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

    expect(JSON.stringify(workspaceSettings)).not.toContain("lin_api_secret");
    expect(openSecret(workspaceSettings.linearApiKey)).toBe("lin_api_secret");
    expect(workspaceSettings.linearTeamId).toBe("team-1");
    expect(workspaceSettings.linear).toMatchObject({ connected: true, teamName: "Eng" });
  });

  it("rejects a key Linear refuses", async () => {
    mockLinear("error");
    const { POST } = await import("@/app/api/workspaces/[workspaceId]/integrations/linear/route");
    const res = await POST(req("POST", { apiKey: "bad" }), wsParams);
    expect(res.status).toBe(400);
    expect(workspaceSettings.linearApiKey).toBeUndefined();
  });

  it("disconnect removes the credentials", async () => {
    mockLinear([{ id: "team-1", name: "Eng" }]);
    const { POST, DELETE } = await import(
      "@/app/api/workspaces/[workspaceId]/integrations/linear/route"
    );
    await POST(req("POST", { apiKey: "k" }), wsParams);
    await DELETE(req("DELETE"), wsParams);
    expect(workspaceSettings.linearApiKey).toBeUndefined();
    expect(workspaceSettings.linearTeamId).toBeUndefined();
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
    const prismaMod = await import("@/lib/db");
    vi.mocked(prismaMod.prisma.project.findUnique).mockResolvedValueOnce({
      settings: {},
      workspace: { settings: workspaceSettings },
    } as never);

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

    const stored = (projectSettings.webhooks as Array<Record<string, unknown>>)[0];
    expect(JSON.stringify(stored)).not.toContain(data.secret);
    expect(openSecret(stored.secretSealed)).toBe(data.secret);

    const listed = await (await GET(req("GET"), pParams)).json();
    expect(listed.data).toEqual([
      { id: data.endpoint.id, url: "https://example.com/hook", events: ["run.completed"], isEnabled: true },
    ]);

    const idParams = { params: Promise.resolve({ projectId: "p1", webhookId: data.endpoint.id }) };
    await PATCH(req("PATCH", { isEnabled: false }), idParams);
    expect((projectSettings.webhooks as Array<{ enabled: boolean }>)[0].enabled).toBe(false);

    const missing = await DELETE(req("DELETE"), {
      params: Promise.resolve({ projectId: "p1", webhookId: "nope" }),
    });
    expect(missing.status).toBe(404);
    await DELETE(req("DELETE"), idParams);
    expect(projectSettings.webhooks).toEqual([]);
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
