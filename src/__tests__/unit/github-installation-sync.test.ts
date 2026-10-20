import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.ENCRYPTION_KEY = "f".repeat(64);

const gh = vi.hoisted(() => ({ listUserInstallations: vi.fn() }));
vi.mock("@/lib/github/app", () => gh);
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    gitHubInstallation: { findMany: vi.fn(), upsert: vi.fn() },
    $executeRaw: vi.fn(async () => 1),
  },
}));

import { prisma } from "@/lib/db";
import { syncInstallations } from "@/services/github-installation-sync";
import { encryptToken } from "@/lib/vault/token";

const db = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> };
  gitHubInstallation: { findMany: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> };
};
const inst = (id: number, login: string) => ({ id, account: { login, type: "Organization", avatar_url: "" } });

beforeEach(() => {
  vi.clearAllMocks();
  db.gitHubInstallation.findMany.mockResolvedValue([]);
});

describe("syncInstallations", () => {
  it("links only installations GitHub reports for this user, using their token", async () => {
    db.user.findUnique.mockResolvedValue({ githubAccessToken: encryptToken("gho_usertoken") });
    gh.listUserInstallations.mockResolvedValue([inst(1, "mine"), inst(2, "also-mine")]);

    expect(await syncInstallations("ws-1", "user-1")).toBe(2);
    expect(gh.listUserInstallations).toHaveBeenCalledWith("gho_usertoken");
    const linked = db.gitHubInstallation.upsert.mock.calls.map((c) => c[0].create.installationId);
    expect(linked).toEqual([1, 2]);
    expect(db.gitHubInstallation.upsert.mock.calls.every((c) => c[0].create.workspaceId === "ws-1")).toBe(true);
  });

  it("skips installations already linked to the workspace", async () => {
    db.user.findUnique.mockResolvedValue({ githubAccessToken: "gho_legacy_plaintext" });
    db.gitHubInstallation.findMany.mockResolvedValueOnce([{ installationId: 1 }]);
    gh.listUserInstallations.mockResolvedValue([inst(1, "mine"), inst(2, "new")]);
    expect(await syncInstallations("ws-1", "user-1")).toBe(1);
  });

  it("returns null without calling GitHub when the user has no token", async () => {
    db.user.findUnique.mockResolvedValue({ githubAccessToken: null });
    expect(await syncInstallations("ws-1", "user-1")).toBeNull();
    expect(gh.listUserInstallations).not.toHaveBeenCalled();
    expect(db.gitHubInstallation.upsert).not.toHaveBeenCalled();
  });

  it("no longer exposes an app-wide listing", async () => {
    const app = await vi.importActual<typeof import("@/lib/github/app")>("@/lib/github/app");
    expect("listAllAppInstallations" in app).toBe(false);
  });
});
