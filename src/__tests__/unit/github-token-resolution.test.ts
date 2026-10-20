import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/github/app", () => ({
  isGitHubAppConfigured: () => true,
  getInstallationToken: vi.fn(async (id: number) => `inst-token-${id}`),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    project: { findUnique: vi.fn() },
    gitHubInstallation: { findFirst: vi.fn() },
    workspaceMember: { findFirst: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { resolveGitHubToken } from "@/lib/github/token";

const fetchMock = vi.fn();
const db = prisma as unknown as {
  project: { findUnique: ReturnType<typeof vi.fn> };
  gitHubInstallation: { findFirst: ReturnType<typeof vi.fn> };
  workspaceMember: { findFirst: ReturnType<typeof vi.fn> };
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GITHUB_TOKEN", "operator-token-fixture");
  vi.stubEnv("ORBIT_SELF_HOSTED", "");
  vi.stubEnv("ORBIT_GITHUB_TOKEN_FALLBACK", "");
  vi.stubGlobal("fetch", fetchMock);
  db.project.findUnique.mockResolvedValue({ repoOwner: "acme", repoName: "app", workspaceId: "ws-1" });
  db.workspaceMember.findFirst.mockResolvedValue(null);
});

describe("resolveGitHubToken installation lookup", () => {
  it("only considers installations linked to the project's own workspace", async () => {
    db.gitHubInstallation.findFirst.mockResolvedValue({ installationId: 9 });
    const result = await resolveGitHubToken("p1");
    expect(db.gitHubInstallation.findFirst.mock.calls[0][0].where).toEqual({
      workspaceId: "ws-1",
      accountLogin: "acme",
    });
    expect(result).toEqual({ token: "inst-token-9", source: "installation" });
  });

  it("does not fall back to a global installation for the same owner login", async () => {
    db.gitHubInstallation.findFirst.mockResolvedValue(null);
    expect(await resolveGitHubToken("p1")).toBeNull();
  });
});

describe("operator GITHUB_TOKEN fallback", () => {
  beforeEach(() => db.gitHubInstallation.findFirst.mockResolvedValue(null));

  it("is never used on hosted Orbit, not even for public repos or with the flag", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    expect(await resolveGitHubToken("p1")).toBeNull();
    vi.stubEnv("ORBIT_GITHUB_TOKEN_FALLBACK", "true");
    expect(await resolveGitHubToken("p1")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("self-hosted", () => {
    beforeEach(() => vi.stubEnv("ORBIT_SELF_HOSTED", "true"));

    it("is used for a public repo", async () => {
      fetchMock.mockResolvedValue({ ok: true });
      expect(await resolveGitHubToken("p1")).toEqual({ token: "operator-token-fixture", source: "env" });
      expect(fetchMock.mock.calls[0][0]).toBe("https://api.github.com/repos/acme/app");
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
    });

    it("is not used for a private repo (the unauthenticated probe gets 404)", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 404 });
      expect(await resolveGitHubToken("p1")).toBeNull();
    });

    it("fails closed when the probe errors", async () => {
      fetchMock.mockRejectedValue(new Error("network"));
      expect(await resolveGitHubToken("p1")).toBeNull();
    });

    it("is used for private repos only with ORBIT_GITHUB_TOKEN_FALLBACK=true", async () => {
      vi.stubEnv("ORBIT_GITHUB_TOKEN_FALLBACK", "true");
      expect(await resolveGitHubToken("p1")).toEqual({ token: "operator-token-fixture", source: "env" });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("never overrides a workspace's own OAuth token", async () => {
      db.workspaceMember.findFirst.mockResolvedValue({
        user: { accounts: [{ access_token: "member-oauth" }] },
      });
      expect(await resolveGitHubToken("p1")).toEqual({ token: "member-oauth", source: "oauth" });
    });
  });
});
