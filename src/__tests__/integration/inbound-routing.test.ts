import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "crypto";

process.env.ENCRYPTION_KEY = "9".repeat(64);

const launch = vi.hoisted(() => ({
  launchPipelineRun: vi.fn(async () => ({ ok: true, runId: "run-new" })),
  launchSummary: vi.fn(() => ({ runId: "run-new" })),
}));
const commands = vi.hoisted(() => ({
  handleStatus: vi.fn(async (workspaceId: string) => ({ text: `status:${workspaceId}` })),
  handleRun: vi.fn(),
  handleResults: vi.fn(),
  handleHealth: vi.fn(),
}));

vi.mock("@/lib/db", async () => {
  const fake = (await import("../helpers/fake-config-db")).createFakeConfigDb();
  return {
    prisma: Object.assign(fake.prisma, {
      // Interactions: honour the workspace scope the route adds to the lookup
      testRun: {
        findFirst: vi.fn(async ({ where }: { where: { id: string; project: { workspaceId: string } } }) =>
          where.id === RUN_IN_W1 && where.project.workspaceId === "w1"
            ? { projectId: "p1", mode: "full", branch: null, project: { defaultBranch: "main" } }
            : null
        ),
      },
    }),
  };
});
vi.mock("@/services/orchestrator/run-launcher", () => launch);
vi.mock("@/services/integrations/slack-commands", () => commands);
vi.mock("@/server/http/session", async () => (await import("../helpers/route-auth")).sessionMock());
vi.mock("@/server/http/auth", async (orig) =>
  (await import("../helpers/route-auth")).authMock(await orig<Record<string, unknown>>())
);
vi.mock("@/lib/auth/audit", () => ({ auditSettingsChange: vi.fn() }));

import { prisma } from "@/lib/db";
import { fakeOf } from "../helpers/fake-config-db";
import { resetRouteAuth, routeAuth } from "../helpers/route-auth";
import { sealSecret } from "@/lib/integrations/secret-field";

const RUN_IN_W1 = "6f1c1d1e-0000-4000-8000-000000000001";
const db = fakeOf(prisma);
const SIGNING = "slack-app-secret";

function connect(workspaceId: string, provider: "linear" | "slack", extra: Record<string, unknown> = {}) {
  db.integrations.push({
    id: crypto.randomUUID(), workspaceId, provider, status: "connected", credentialsSealed: sealSecret("k"),
    settings: { provider }, externalAccountId: null, inboundTokenHash: null, ...extra,
  });
}

const wsReq = (url = "http://localhost/x") => new NextRequest(url, { method: "POST" });
const asAdminOf = (workspaceId: string) => {
  routeAuth.workspaceId = workspaceId;
  return { params: Promise.resolve({ workspaceId }) };
};

beforeEach(() => {
  vi.clearAllMocks();
  db.reset();
  resetRouteAuth();
  process.env.SLACK_SIGNING_SECRET = SIGNING;
  for (const ws of ["w1", "w2"]) db.addWorkspace(ws);
  db.addProject("p1", "w1");
  db.addProject("p2", "w2");
});

describe("Linear inbound webhook", () => {
  async function issueUrl(workspaceId: string) {
    const { POST } = await import("@/app/api/workspaces/[workspaceId]/integrations/linear/inbound/route");
    const res = await POST(wsReq(), asAdminOf(workspaceId));
    return new URL((await res.json()).data.webhookUrl);
  }

  async function deliver(url: URL, body: unknown) {
    const connectionId = url.pathname.split("/").pop() as string;
    const { POST } = await import("@/app/api/webhooks/linear/[connectionId]/route");
    return POST(new NextRequest(url, { method: "POST", body: JSON.stringify(body) }), {
      params: Promise.resolve({ connectionId }),
    });
  }

  const done = { type: "Issue", action: "update", data: { id: "i1", team: { id: "team-1" }, state: { type: "completed", name: "Done" } } };

  it("the retired shared URL rejects everything", async () => {
    const { POST } = await import("@/app/api/webhooks/linear/route");
    expect((await POST()).status).toBe(410);
  });

  it("runs only with the connection's own token, against its workspace's project", async () => {
    connect("w1", "linear", { externalAccountId: "team-1" });
    const url = await issueUrl("w1");
    expect(url.pathname).toMatch(/^\/api\/webhooks\/linear\/[0-9a-f-]{36}$/);
    expect(db.integrations[0].inboundTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(db.integrations[0])).not.toContain(url.searchParams.get("token"));

    const ok = await deliver(url, done);
    expect((await ok.json()).status).toBe("run_triggered");
    expect(launch.launchPipelineRun).toHaveBeenCalledWith(expect.objectContaining({ projectId: "p1", mode: "regression" }));

    const wrong = new URL(url);
    wrong.searchParams.set("token", "orbit_wh_guess");
    expect((await deliver(wrong, done)).status).toBe(401);
    const none = new URL(url);
    none.search = "";
    expect((await deliver(none, done)).status).toBe(401);
  });

  it("a rotated URL replaces the old one, and a disconnect closes it", async () => {
    connect("w1", "linear");
    const first = await issueUrl("w1");
    const second = await issueUrl("w1");
    expect((await deliver(first, done)).status).toBe(401);
    expect((await deliver(second, done)).status).toBe(200);

    const { DELETE } = await import("@/app/api/workspaces/[workspaceId]/integrations/linear/route");
    await DELETE(wsReq(), asAdminOf("w1"));
    expect((await deliver(second, done)).status).toBe(401);
  });

  it("ignores other teams, and never picks a project outside the workspace", async () => {
    const foreign = "6f1c1d1e-0000-4000-8000-0000000000f2";
    db.addProject(foreign, "w2");
    connect("w1", "linear", { externalAccountId: "team-1", settings: { provider: "linear", inboundProjectId: foreign } });
    const url = await issueUrl("w1");

    const other = await deliver(url, { ...done, data: { ...done.data, team: { id: "team-2" } } });
    expect((await other.json()).reason).toBe("other_team");

    // That project belongs to w2: the setting can't route there
    const res = await deliver(url, done);
    expect((await res.json()).reason).toBe("no_target_project");
    expect(launch.launchPipelineRun).not.toHaveBeenCalled();
  });

  it("the inbound project must be in the workspace", async () => {
    connect("w1", "linear");
    const { PATCH } = await import("@/app/api/workspaces/[workspaceId]/integrations/linear/route");
    const body = JSON.stringify({ inboundProjectId: "6f1c1d1e-0000-4000-8000-000000000002" });
    const res = await PATCH(new NextRequest("http://localhost/x", { method: "PATCH", body }), asAdminOf("w1"));
    expect(res.status).toBe(404);
  });
});

describe("Slack commands route by a verified, uniquely linked team", () => {
  function signed(path: "commands" | "interactions", body: string) {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = "v0=" + createHmac("sha256", SIGNING).update(`v0:${ts}:${body}`).digest("hex");
    return new NextRequest(`http://localhost/api/webhooks/slack/${path}`, {
      method: "POST",
      body,
      headers: { "x-slack-request-timestamp": ts, "x-slack-signature": sig },
    });
  }

  async function command(text: string, teamId = "T1") {
    const { POST } = await import("@/app/api/webhooks/slack/commands/route");
    const res = await POST(signed("commands", new URLSearchParams({ text, team_id: teamId }).toString()));
    return (await res.json()) as { text: string };
  }

  async function linkCode(workspaceId: string) {
    const { POST } = await import("@/app/api/workspaces/[workspaceId]/integrations/slack/link/route");
    const res = await POST(wsReq(), asAdminOf(workspaceId));
    return ((await res.json()).data.command as string).split(" ").pop() as string;
  }

  it("an unlinked team gets instructions, not another workspace's data", async () => {
    connect("w1", "slack");
    expect((await command("status")).text).toContain("not linked");
    expect(commands.handleStatus).not.toHaveBeenCalled();
  });

  it("links through a single-use code, then routes to that workspace", async () => {
    connect("w1", "slack");
    const code = await linkCode("w1");
    expect((await command(`link ${code}`)).text).toMatch(/^Linked/);
    expect((await command(`link ${code}`, "T9")).text).toContain("invalid or expired");

    expect((await command("status")).text).toBe("status:w1");
  });

  it("an expired code links nothing", async () => {
    connect("w1", "slack");
    const code = await linkCode("w1");
    (db.integrations[0].settings as Record<string, unknown>).linkCodeExpiresAt = new Date(Date.now() - 1000).toISOString();
    expect((await command(`link ${code}`)).text).toContain("invalid or expired");
    expect(db.integrations[0].externalAccountId).toBeNull();
  });

  it("a second workspace claiming the team waits for its admin to confirm", async () => {
    connect("w1", "slack");
    connect("w2", "slack");
    await command(`link ${await linkCode("w1")}`);

    expect((await command(`link ${await linkCode("w2")}`)).text).toContain("must confirm");
    expect((await command("status")).text).toBe("status:w1");

    const { POST } = await import("@/app/api/workspaces/[workspaceId]/integrations/slack/link/confirm/route");
    expect((await POST(wsReq(), asAdminOf("w2"))).status).toBe(200);
    expect((await command("status")).text).toBe("status:w2");
    expect(db.integrations.find((r) => r.workspaceId === "w1")?.externalAccountId).toBeNull();
  });

  it("a team bound to two workspaces is refused, never guessed", async () => {
    connect("w1", "slack", { externalAccountId: "T1" });
    connect("w2", "slack", { externalAccountId: "T1" });
    expect((await command("status")).text).toContain("more than one Orbit workspace");
    expect(commands.handleStatus).not.toHaveBeenCalled();
  });

  it("button actions only reach the linked workspace's runs", async () => {
    connect("w2", "slack", { externalAccountId: "T1" });
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const payload = {
      type: "block_actions",
      actions: [{ action_id: "orbit_rerun", value: RUN_IN_W1, type: "button" }],
      user: { id: "U1", username: "u" },
      team: { id: "T1" },
      response_url: "https://hooks.slack.com/actions/x",
    };
    const { POST } = await import("@/app/api/webhooks/slack/interactions/route");
    await POST(signed("interactions", new URLSearchParams({ payload: JSON.stringify(payload) }).toString()));

    expect(launch.launchPipelineRun).not.toHaveBeenCalled();
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.text).toBe("Original run not found.");
    vi.unstubAllGlobals();
  });
});
