import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { JWT } from "next-auth/jwt";
import type { Account, User } from "next-auth";

process.env.ENCRYPTION_KEY = "d".repeat(64);

vi.mock("@next-auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));
vi.mock("next-auth/providers/github", () => ({ default: () => ({ id: "github" }) }));
vi.mock("next-auth/providers/gitlab", () => ({ default: () => ({ id: "gitlab" }) }));
vi.mock("@/lib/auth/signup-policy", () => ({ evaluateSignIn: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { update: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    workspaceMember: { findFirst: vi.fn(), create: vi.fn() },
    workspaceInvitation: { findFirst: vi.fn() },
    workspace: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/db";
import { evaluateSignIn } from "@/lib/auth/signup-policy";
import { authOptions } from "@/lib/auth";
import { decryptToken } from "@/lib/vault/token";

const db = prisma as unknown as {
  user: Record<"update" | "findUnique" | "count", ReturnType<typeof vi.fn>>;
  workspaceMember: Record<"findFirst" | "create", ReturnType<typeof vi.fn>>;
  workspaceInvitation: { findFirst: ReturnType<typeof vi.fn> };
  workspace: { create: ReturnType<typeof vi.fn> };
};
const evaluate = evaluateSignIn as ReturnType<typeof vi.fn>;

const user = { id: "u1", email: "Dev@Acme.com", name: "Dev" } as User;
const github = { provider: "github", access_token: "gho_realtoken123" } as Account;

function runJwt(overrides: { user?: User; account?: Account } = {}) {
  return authOptions.callbacks!.jwt!({
    token: {} as JWT,
    user: overrides.user ?? user,
    account: overrides.account ?? github,
    trigger: "signIn",
  } as Parameters<NonNullable<NonNullable<typeof authOptions.callbacks>["jwt"]>>[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPER_ADMIN_EMAILS", "");
  vi.stubEnv("ORBIT_SELF_HOSTED", "");
  db.user.update.mockResolvedValue({});
  db.user.findUnique.mockResolvedValue({ role: "user" });
  db.user.count.mockResolvedValue(10);
  db.workspaceMember.findFirst.mockResolvedValue({
    workspaceId: "ws-1",
    role: "owner",
    workspace: { slug: "ws" },
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("signIn callback", () => {
  const signIn = authOptions.callbacks!.signIn!;

  it("rejects users without an email", async () => {
    expect(await signIn({ user: { id: "u" } as User, account: null, profile: undefined })).toBe(false);
  });

  it("allows when the policy allows", async () => {
    evaluate.mockResolvedValue({ allowed: true });
    expect(await signIn({ user, account: github, profile: undefined })).toBe(true);
    expect(evaluate).toHaveBeenCalledWith("Dev@Acme.com");
  });

  it("redirects to /login with the policy error when denied", async () => {
    evaluate.mockResolvedValue({ allowed: false, error: "SignupInviteOnly" });
    expect(await signIn({ user, account: github, profile: undefined })).toBe("/login?error=SignupInviteOnly");
  });
});

describe("jwt callback: GitHub token storage", () => {
  it("stores the token encrypted, never plaintext", async () => {
    await runJwt();
    const stored = db.user.update.mock.calls.find((c) => c[0].data.githubAccessToken)![0].data
      .githubAccessToken as string;
    expect(stored).not.toContain("gho_realtoken123");
    expect(decryptToken(stored)).toBe("gho_realtoken123");
  });

  it("re-encrypts on every login, which upgrades legacy plaintext rows", async () => {
    // Row currently holds plaintext; the login write replaces it with ciphertext
    await runJwt();
    const written = db.user.update.mock.calls[0][0].data.githubAccessToken as string;
    expect(written.startsWith("enc:v1:")).toBe(true);
  });

  it("does not fail the login if storing the token fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.user.update.mockRejectedValueOnce(new Error("db down"));
    await expect(runJwt()).resolves.toBeDefined();
  });
});

describe("jwt callback: self-hosted first user", () => {
  it("promotes the very first user to super admin on self-host", async () => {
    vi.stubEnv("ORBIT_SELF_HOSTED", "true");
    db.user.count.mockResolvedValue(1);
    await runJwt();
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { role: "super_admin" } });
  });

  it("does not promote later users, or anyone on cloud", async () => {
    vi.stubEnv("ORBIT_SELF_HOSTED", "true");
    db.user.count.mockResolvedValue(2);
    await runJwt();
    vi.stubEnv("ORBIT_SELF_HOSTED", "");
    db.user.count.mockResolvedValue(1);
    await runJwt();
    const roleWrites = db.user.update.mock.calls.filter((c) => c[0].data.role);
    expect(roleWrites).toHaveLength(0);
  });

  it("makes a user without membership or invitation the owner of a new workspace", async () => {
    vi.stubEnv("ORBIT_SELF_HOSTED", "true");
    db.user.count.mockResolvedValue(1);
    db.workspaceMember.findFirst.mockResolvedValue(null);
    db.workspaceInvitation.findFirst.mockResolvedValue(null);
    db.workspace.create.mockResolvedValue({ id: "ws-new", slug: "dev" });
    db.workspaceMember.create.mockResolvedValue({});
    const token = await runJwt();
    expect(db.workspaceMember.create.mock.calls[0][0].data.role).toBe("owner");
    expect(token.role).toBe("owner");
  });
});

describe("session callback", () => {
  it("does not expose provider access tokens to the browser", async () => {
    const session = await authOptions.callbacks!.session!({
      session: { user: { name: "x" }, expires: "" },
      token: { userId: "u1", githubAccessToken: "gho_secret", gitlabAccessToken: "glpat_secret" },
    } as Parameters<NonNullable<NonNullable<typeof authOptions.callbacks>["session"]>>[0]);
    expect(JSON.stringify(session)).not.toContain("gho_secret");
    expect(JSON.stringify(session)).not.toContain("glpat_secret");
  });
});
