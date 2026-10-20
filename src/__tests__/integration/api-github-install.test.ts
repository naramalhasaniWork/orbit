import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const cookieStore = vi.hoisted(() => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }));
const redirectMock = vi.hoisted(() =>
  vi.fn((_url: string) => {
    throw new Error("NEXT_REDIRECT"); // same message Next.js uses
  })
);

vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/utils/api", () => ({
  apiError: vi.fn(),
  requireWorkspace: vi.fn(async () => ({ workspaceId: "ws-1" })),
}));
vi.mock("@/lib/github/app", () => ({
  isGitHubAppConfigured: () => true,
  getInstallUrl: () => "https://github.com/apps/orbit/installations/new",
  getInstallationInfo: vi.fn(),
}));

import { GET as install } from "@/app/api/github/install/route";
import { GET as callback } from "@/app/api/github/installations/callback/route";

describe("github install return_to", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores a relative return_to", async () => {
    await install(new NextRequest("http://localhost/api/github/install?return_to=/dashboard/settings"));
    expect(cookieStore.set.mock.calls[0][1]).toBe("/dashboard/settings");
  });

  it.each(["https://evil.com", "//evil.com", "/\\evil.com"])("replaces %s with the default", async (bad) => {
    await install(
      new NextRequest(`http://localhost/api/github/install?return_to=${encodeURIComponent(bad)}`)
    );
    expect(cookieStore.set.mock.calls[0][1]).toBe("/dashboard/onboarding");
  });

  it("callback ignores a tampered cookie and redirects locally", async () => {
    cookieStore.get.mockReturnValue({ value: "https://evil.com/phish" });
    await expect(
      callback(new NextRequest("http://localhost/api/github/installations/callback"))
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock.mock.calls[0][0]).toBe("/dashboard/onboarding?error=invalid_callback");
  });
});
