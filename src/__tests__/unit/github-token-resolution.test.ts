import { describe, it, expect, vi, beforeEach } from "vitest";

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

const db = prisma as unknown as {
  project: { findUnique: ReturnType<typeof vi.fn> };
  gitHubInstallation: { findFirst: ReturnType<typeof vi.fn> };
  workspaceMember: { findFirst: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GITHUB_TOKEN", "");
  db.project.findUnique.mockResolvedValue({ repoOwner: "acme", workspaceId: "ws-1" });
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
