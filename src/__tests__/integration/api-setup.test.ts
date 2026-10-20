import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

let selfHosted = true;
let userCount = 0;
const patch = vi.fn();
const installs = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { count: vi.fn(async () => userCount) },
    gitHubInstallation: { count: (...a: unknown[]) => installs(...a) },
    providerConfig: { count: vi.fn(async () => 0) },
    workspaceMember: { count: vi.fn(async () => 1) },
    workspaceInvitation: { count: vi.fn(async () => 0) },
  },
}));
vi.mock("@/lib/self-host", async (orig) => ({
  ...(await orig<typeof import("@/lib/self-host")>()),
  isSelfHosted: () => selfHosted,
}));
let workspaceSettings: Record<string, unknown> | null = {};
vi.mock("@/lib/integrations/workspace-settings", () => ({
  readWorkspaceSettings: vi.fn(async () => workspaceSettings),
  patchWorkspaceSettings: (...a: unknown[]) => patch(...a),
}));
vi.mock("@/lib/auth/rbac", () => ({
  requirePermission: vi.fn(async () => ({ session: { user: { id: "u1" } } })),
}));
vi.mock("@/lib/auth/audit", () => ({ auditSettingsChange: vi.fn() }));

const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(`http://localhost${url}`, init);

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  selfHosted = true;
  userCount = 0;
  workspaceSettings = {};
  installs.mockResolvedValue(0);
  patch.mockResolvedValue({});
});

describe("GitHub App manifest routes", () => {
  it("404 once a user exists or when not self-hosted", async () => {
    const { GET: start } = await import("@/app/api/setup/github-app/start/route");
    const { GET: callback } = await import("@/app/api/setup/github-app/callback/route");

    userCount = 1;
    expect((await start(req("/api/setup/github-app/start"))).status).toBe(404);
    expect((await callback(req("/api/setup/github-app/callback?code=abcdefghijk&state=x"))).status).toBe(404);

    userCount = 0;
    selfHosted = false;
    expect((await start(req("/api/setup/github-app/start"))).status).toBe(404);
  });

  it("start sets a state cookie, embeds the manifest and rejects a bad org", async () => {
    const { GET: start } = await import("@/app/api/setup/github-app/start/route");
    process.env.NEXTAUTH_URL = "https://orbit.example.com";

    const res = await start(req("/api/setup/github-app/start"));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("orbit_manifest_state=");
    const html = await res.text();
    expect(html).toContain("https://github.com/settings/apps/new?state=");
    expect(html).toContain("api/webhooks/github");

    const org = await start(req("/api/setup/github-app/start?org=acme"));
    expect(await org.text()).toContain("organizations/acme/settings/apps/new");
    expect((await start(req("/api/setup/github-app/start?org=../evil"))).status).toBe(400);
  });

  it("callback rejects a missing or mismatched state without calling GitHub", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { GET: callback } = await import("@/app/api/setup/github-app/callback/route");

    const noCookie = await callback(req("/api/setup/github-app/callback?code=abcdefghijk&state=abc"));
    expect(noCookie.status).toBe(400);
    const wrong = await callback(
      req("/api/setup/github-app/callback?code=abcdefghijk&state=abc", { headers: { cookie: "orbit_manifest_state=zzz" } })
    );
    expect(wrong.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("callback exchanges the code and shows escaped credentials", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: 9,
          slug: "orbit",
          client_id: "cid",
          client_secret: "<script>",
          webhook_secret: "wh",
          pem: "-----BEGIN-----\nx\n-----END-----",
          html_url: "https://github.com/apps/orbit",
        }),
        { status: 201 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const { GET: callback } = await import("@/app/api/setup/github-app/callback/route");

    const res = await callback(
      req("/api/setup/github-app/callback?code=abcdefghijk&state=good", { headers: { cookie: "orbit_manifest_state=good" } })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const html = await res.text();
    expect(html).toContain("GITHUB_APP_ID=9");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect((fetchMock.mock.calls as unknown as Array<[string]>)[0][0]).toBe(
      "https://api.github.com/app-manifests/abcdefghijk/conversions"
    );
  });
});

describe("Finish setup card", () => {
  it("is hidden when not self-hosted, for non-admins and once dismissed", async () => {
    const { getFinishSetupSteps } = await import("@/lib/setup/finish-setup");
    selfHosted = false;
    expect(await getFinishSetupSteps("w1", "owner")).toBeNull();
    selfHosted = true;
    expect(await getFinishSetupSteps("w1", "member")).toBeNull();
    workspaceSettings = { finishSetupDismissed: true };
    expect(await getFinishSetupSteps("w1", "owner")).toBeNull();
  });

  it("lists steps with live status for an admin", async () => {
    installs.mockResolvedValue(1);
    const { getFinishSetupSteps } = await import("@/lib/setup/finish-setup");
    const steps = await getFinishSetupSteps("w1", "owner");
    expect(steps?.map((s) => [s.id, s.done])).toEqual([
      ["github-app", true],
      ["model-key", false],
      ["invite", false],
      ["signup", false],
    ]);
  });

  it("dismiss stores the flag on the workspace", async () => {
    const { POST } = await import("@/app/api/workspaces/[workspaceId]/finish-setup/route");
    const res = await POST(req("/x", { method: "POST" }), { params: Promise.resolve({ workspaceId: "w1" }) });
    expect(res.status).toBe(200);
    expect(patch).toHaveBeenCalledWith("w1", { finishSetupDismissed: true });
  });
});
