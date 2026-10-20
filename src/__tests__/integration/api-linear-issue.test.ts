import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getLinearConfig = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    project: { findFirst: vi.fn(async () => ({ id: "p1", name: "Acme" })) },
  },
}));
vi.mock("@/lib/utils/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils/api")>();
  return { ...actual, requireWorkspace: vi.fn(async () => ({ workspaceId: "w1" })) };
});
vi.mock("@/lib/auth/rbac", () => ({ requirePermission: vi.fn(async () => ({ role: "owner" })) }));
vi.mock("@/services/reporting/integrations/linear", () => ({
  getLinearConfig: (...a: unknown[]) => getLinearConfig(...a),
}));

const params = { params: Promise.resolve({ projectId: "p1" }) };
const post = () =>
  new NextRequest("http://localhost/x", {
    method: "POST",
    body: JSON.stringify({ testResultId: "r1", testCaseName: "Checkout", failureExplanation: "boom", suggestedFix: null }),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST linear-issue", () => {
  it("uses the key saved by Settings → Integrations → Linear", async () => {
    getLinearConfig.mockResolvedValue({ apiKey: "lin_key", teamId: "team-1" });
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ data: { issueCreate: { success: true, issue: { id: "i1", identifier: "ENG-1", url: "https://linear.app/x" } } } }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/projects/[projectId]/linear-issue/route");

    const res = await POST(post(), params);
    expect(res.status).toBe(200);
    expect(getLinearConfig).toHaveBeenCalledWith("p1");
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("lin_key");
    expect(JSON.parse(init.body as string).variables.teamId).toBe("team-1");
  });

  it("explains how to connect Linear when it is not configured", async () => {
    getLinearConfig.mockResolvedValue(null);
    const { POST } = await import("@/app/api/projects/[projectId]/linear-issue/route");
    const res = await POST(post(), params);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(JSON.stringify(json)).toContain("Settings");
  });
});

describe("operator credential fallbacks are single-tenant only", () => {
  it("getLinearConfig ignores LINEAR_API_KEY on hosted, uses it when self-hosted", async () => {
    vi.resetModules();
    vi.doUnmock("@/services/reporting/integrations/linear");
    vi.doMock("@/lib/db", () => ({
      prisma: { project: { findUnique: vi.fn(async () => ({ settings: {}, workspace: { settings: {} } })) } },
    }));
    vi.stubEnv("LINEAR_API_KEY", "operator-key");
    vi.stubEnv("LINEAR_TEAM_ID", "operator-team");

    vi.stubEnv("ORBIT_SELF_HOSTED", "");
    const hosted = await import("@/services/reporting/integrations/linear");
    expect(await hosted.getLinearConfig("p1")).toBeNull();

    vi.resetModules();
    vi.stubEnv("ORBIT_SELF_HOSTED", "true");
    const selfHosted = await import("@/services/reporting/integrations/linear");
    expect(await selfHosted.getLinearConfig("p1")).toEqual({ apiKey: "operator-key", teamId: "operator-team" });
    vi.unstubAllEnvs();
  });
});
