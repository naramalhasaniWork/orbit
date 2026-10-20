import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const rbac = vi.hoisted(() => ({ requirePermission: vi.fn() }));
const sync = vi.hoisted(() => ({ syncInstallations: vi.fn() }));
const dbMock = vi.hoisted(() => ({
  gitHubInstallation: { findMany: vi.fn(async () => []), deleteMany: vi.fn() },
}));

vi.mock("@/lib/auth/rbac", () => rbac);
vi.mock("@/services/github-installation-sync", () => sync);
vi.mock("@/lib/db", () => ({ prisma: dbMock }));
vi.mock("@/lib/github/app", () => ({ isGitHubAppConfigured: () => true }));
vi.mock("@/lib/utils/api", async () => {
  const { NextResponse } = await import("next/server");
  class AuthError extends Error {
    constructor(m: string, public code: string, public status: number) {
      super(m);
    }
  }
  return {
    AuthError,
    requireWorkspace: vi.fn(async () => ({ workspaceId: "ws-1" })),
    apiSuccess: (data: unknown, status = 200) => NextResponse.json({ success: true, data }, { status }),
    apiError: (message: string, code: string, status = 400) =>
      NextResponse.json({ success: false, error: { message, code } }, { status }),
    handleApiError: (e: unknown) =>
      NextResponse.json({ error: "x" }, { status: e instanceof AuthError ? e.status : 500 }),
  };
});

import { GET, POST, DELETE } from "@/app/api/github/installations/route";

beforeEach(async () => {
  vi.clearAllMocks();
  const { AuthError } = await import("@/lib/utils/api");
  rbac.requirePermission.mockImplementation(async (_ws: string, perm: string) => {
    if (perm === "integrations.manage") throw new AuthError("denied", "FORBIDDEN", 403);
    return { session: { user: { id: "u1" } } };
  });
});

describe("github installations routes for a role without integrations.manage", () => {
  it("can list (integrations.view) and is pointed at the signed install route", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).data.installUrl).toBe("/api/github/install");
  });

  it("cannot sync", async () => {
    expect((await POST()).status).toBe(403);
    expect(sync.syncInstallations).not.toHaveBeenCalled();
  });

  it("cannot delete", async () => {
    const res = await DELETE(new Request("http://localhost/x", { method: "DELETE", body: JSON.stringify({ installationId: "i" }) }));
    expect(res.status).toBe(403);
    expect(dbMock.gitHubInstallation.deleteMany).not.toHaveBeenCalled();
  });
});
