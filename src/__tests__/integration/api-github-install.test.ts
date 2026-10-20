import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

process.env.NEXTAUTH_SECRET = "n".repeat(40);

const cookieStore = vi.hoisted(() => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }));
const redirectMock = vi.hoisted(() =>
  vi.fn((_url: string) => {
    throw new Error("NEXT_REDIRECT"); // same message Next.js uses
  })
);
const svc = vi.hoisted(() => ({ linkInstallation: vi.fn(), listInstallationsForUser: vi.fn() }));
const rbac = vi.hoisted(() => ({ requirePermission: vi.fn() }));

vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/utils/api", async () => {
  const { NextResponse } = await import("next/server");
  class AuthError extends Error {
    constructor(m: string, public code: string, public status: number) {
      super(m);
    }
  }
  return {
    AuthError,
    apiError: (message: string, code: string, status = 400) =>
      NextResponse.json({ success: false, error: { message, code } }, { status }),
    handleApiError: (e: unknown) =>
      e instanceof AuthError
        ? NextResponse.json({ error: e.message }, { status: e.status })
        : NextResponse.json({ error: "internal" }, { status: 500 }),
    requireWorkspace: vi.fn(async () => ({ session: { user: { id: "user-1" } }, workspaceId: "ws-1" })),
  };
});
vi.mock("@/lib/auth/rbac", () => rbac);
vi.mock("@/lib/github/app", () => ({
  isGitHubAppConfigured: () => true,
  getInstallUrl: (state?: string) => `https://github.com/apps/orbit/installations/new?state=${state}`,
}));
vi.mock("@/services/github-installation-sync", () => svc);

import { GET as install } from "@/app/api/github/install/route";
import { GET as callback } from "@/app/api/github/installations/callback/route";
import { createInstallState } from "@/lib/github/install-state";

const callbackUrl = (params: Record<string, string>) =>
  new NextRequest(
    `http://localhost/api/github/installations/callback?${new URLSearchParams(params).toString()}`
  );
const lastRedirect = () => redirectMock.mock.calls[redirectMock.mock.calls.length - 1][0];

beforeEach(() => {
  vi.clearAllMocks();
  rbac.requirePermission.mockResolvedValue({ session: { user: { id: "user-1" } } });
  cookieStore.get.mockReturnValue(undefined);
});

describe("github install start", () => {
  it("requires integrations.manage and redirects with a signed state for this workspace and user", async () => {
    const res = await install(new NextRequest("http://localhost/api/github/install"));
    expect(rbac.requirePermission).toHaveBeenCalledWith("ws-1", "integrations.manage");
    const state = new URL(res.headers.get("location")!).searchParams.get("state");
    expect(state).toBeTruthy();
    const { verifyInstallState } = await import("@/lib/github/install-state");
    expect(verifyInstallState(state)).toEqual({ workspaceId: "ws-1", userId: "user-1" });
  });

  it("is denied for roles without integrations.manage", async () => {
    const { AuthError } = await import("@/lib/utils/api");
    rbac.requirePermission.mockRejectedValue(new AuthError("denied", "FORBIDDEN", 403));
    const res = await install(new NextRequest("http://localhost/api/github/install"));
    expect(res.status).toBe(403);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("stores a relative return_to", async () => {
    await install(new NextRequest("http://localhost/api/github/install?return_to=/dashboard/settings"));
    expect(cookieStore.set.mock.calls[0][1]).toBe("/dashboard/settings");
  });

  it.each(["https://evil.com", "//evil.com", "/\\evil.com"])("replaces %s with the default", async (bad) => {
    await install(new NextRequest(`http://localhost/api/github/install?return_to=${encodeURIComponent(bad)}`));
    expect(cookieStore.set.mock.calls[0][1]).toBe("/dashboard/onboarding");
  });
});

describe("github install callback", () => {
  const good = () => createInstallState("ws-1", "user-1");
  const valid = () => ({ installation_id: "42", setup_action: "install", state: good() });
  const inst = { id: 42, account: { login: "acme", type: "Organization", avatar_url: "a" } };

  it("ignores a tampered cookie and redirects locally", async () => {
    cookieStore.get.mockReturnValue({ value: "https://evil.com/phish" });
    await expect(callback(callbackUrl({}))).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock.mock.calls[0][0].startsWith("/dashboard/onboarding")).toBe(true);
  });

  it.each([
    ["missing state", () => ({ installation_id: "42", setup_action: "install" })],
    ["garbage state", () => ({ ...valid(), state: "abc.def" })],
    ["state for another user", () => ({ ...valid(), state: createInstallState("ws-1", "attacker") })],
    ["state for another workspace", () => ({ ...valid(), state: createInstallState("ws-2", "user-1") })],
  ])("rejects %s without touching GitHub or the DB", async (_name, params) => {
    await expect(callback(callbackUrl(params()))).rejects.toThrow("NEXT_REDIRECT");
    expect(lastRedirect()).toContain("error=invalid_state");
    expect(svc.listInstallationsForUser).not.toHaveBeenCalled();
    expect(svc.linkInstallation).not.toHaveBeenCalled();
  });

  it("rejects an expired state", async () => {
    const old = createInstallState("ws-1", "user-1", Date.now() - 11 * 60 * 1000);
    await expect(callback(callbackUrl({ ...valid(), state: old }))).rejects.toThrow("NEXT_REDIRECT");
    expect(lastRedirect()).toContain("error=invalid_state");
  });

  it("will not link an installation the user cannot access on GitHub", async () => {
    svc.listInstallationsForUser.mockResolvedValue([{ ...inst, id: 7 }]);
    await expect(callback(callbackUrl(valid()))).rejects.toThrow("NEXT_REDIRECT");
    expect(lastRedirect()).toContain("error=installation_not_accessible");
    expect(svc.linkInstallation).not.toHaveBeenCalled();
  });

  it("asks the user to sign in again when no GitHub token is on file", async () => {
    svc.listInstallationsForUser.mockResolvedValue(null);
    await expect(callback(callbackUrl(valid()))).rejects.toThrow("NEXT_REDIRECT");
    expect(lastRedirect()).toContain("error=reauth_required");
  });

  it("links a verified installation to the state's workspace", async () => {
    svc.listInstallationsForUser.mockResolvedValue([inst]);
    await expect(callback(callbackUrl(valid()))).rejects.toThrow("NEXT_REDIRECT");
    expect(svc.linkInstallation).toHaveBeenCalledWith("ws-1", inst);
    expect(lastRedirect()).toContain("org_connected=acme");
  });

  it("requires integrations.manage", async () => {
    rbac.requirePermission.mockRejectedValue(new Error("denied"));
    await expect(callback(callbackUrl(valid()))).rejects.toThrow("NEXT_REDIRECT");
    expect(svc.linkInstallation).not.toHaveBeenCalled();
  });
});
