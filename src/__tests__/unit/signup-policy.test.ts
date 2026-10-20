import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findFirst: vi.fn(), count: vi.fn() },
    workspaceInvitation: { findFirst: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { evaluateSignIn } from "@/lib/auth/signup-policy";

const db = prisma as unknown as {
  user: { findFirst: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  workspaceInvitation: { findFirst: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ORBIT_SELF_HOSTED", "");
  vi.stubEnv("ORBIT_SIGNUP", "");
  vi.stubEnv("ORBIT_ALLOWED_EMAIL_DOMAINS", "");
  vi.stubEnv("SUPER_ADMIN_EMAILS", "");
  db.user.findFirst.mockResolvedValue(null);
  db.user.count.mockResolvedValue(5);
  db.workspaceInvitation.findFirst.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

describe("evaluateSignIn", () => {
  it("is open by default on cloud", async () => {
    expect(await evaluateSignIn("new@anywhere.com")).toEqual({ allowed: true });
    expect(db.user.findFirst).not.toHaveBeenCalled();
  });

  describe("invite mode", () => {
    beforeEach(() => vi.stubEnv("ORBIT_SIGNUP", "invite"));

    it("rejects a new user without an invitation", async () => {
      expect(await evaluateSignIn("new@x.com")).toEqual({ allowed: false, error: "SignupInviteOnly" });
    });

    it("accepts a new user with a pending invitation (matched case-insensitively)", async () => {
      db.workspaceInvitation.findFirst.mockResolvedValue({ id: "inv-1" });
      expect(await evaluateSignIn("New@X.com")).toEqual({ allowed: true });
      const where = db.workspaceInvitation.findFirst.mock.calls[0][0].where;
      expect(where.email).toBe("new@x.com");
      expect(where.status).toBe("pending");
      expect(where.expiresAt.gt).toBeInstanceOf(Date);
    });

    it("lets existing users in, matching their stored email case", async () => {
      db.user.findFirst.mockResolvedValue({ id: "u1" });
      expect(await evaluateSignIn("Mixed@Case.com")).toEqual({ allowed: true });
      expect(db.user.findFirst.mock.calls[0][0].where.email.in).toEqual(["Mixed@Case.com", "mixed@case.com"]);
    });
  });

  describe("closed mode", () => {
    beforeEach(() => vi.stubEnv("ORBIT_SIGNUP", "closed"));

    it("rejects new users even with an invitation", async () => {
      db.workspaceInvitation.findFirst.mockResolvedValue({ id: "inv-1" });
      expect(await evaluateSignIn("new@x.com")).toEqual({ allowed: false, error: "SignupClosed" });
    });

    it("still admits existing users", async () => {
      db.user.findFirst.mockResolvedValue({ id: "u1" });
      expect(await evaluateSignIn("old@x.com")).toEqual({ allowed: true });
    });
  });

  describe("self-hosted bootstrap", () => {
    beforeEach(() => vi.stubEnv("ORBIT_SELF_HOSTED", "true"));

    it("defaults to invite-only", async () => {
      expect(await evaluateSignIn("new@x.com")).toEqual({ allowed: false, error: "SignupInviteOnly" });
    });

    it("lets the first user in, even when signup is closed", async () => {
      db.user.count.mockResolvedValue(0);
      expect(await evaluateSignIn("first@x.com")).toEqual({ allowed: true });
      vi.stubEnv("ORBIT_SIGNUP", "closed");
      expect(await evaluateSignIn("first@x.com")).toEqual({ allowed: true });
    });

    it("does not give the bootstrap exception to cloud deployments", async () => {
      vi.stubEnv("ORBIT_SELF_HOSTED", "");
      vi.stubEnv("ORBIT_SIGNUP", "closed");
      db.user.count.mockResolvedValue(0);
      expect(await evaluateSignIn("first@x.com")).toEqual({ allowed: false, error: "SignupClosed" });
    });
  });

  describe("email domain allowlist", () => {
    beforeEach(() => vi.stubEnv("ORBIT_ALLOWED_EMAIL_DOMAINS", "acme.com,corp.io"));

    it("allows listed domains (case-insensitive) and blocks others", async () => {
      expect(await evaluateSignIn("dev@ACME.com")).toEqual({ allowed: true });
      expect(await evaluateSignIn("dev@corp.io")).toEqual({ allowed: true });
      expect(await evaluateSignIn("dev@gmail.com")).toEqual({ allowed: false, error: "EmailDomainNotAllowed" });
    });

    it("is not fooled by lookalike domains", async () => {
      expect((await evaluateSignIn("dev@acme.com.evil.io")).allowed).toBe(false);
      expect((await evaluateSignIn("dev@notacme.com")).allowed).toBe(false);
      expect((await evaluateSignIn("acme.com@evil.io")).allowed).toBe(false);
    });

    it("applies on top of the signup mode", async () => {
      vi.stubEnv("ORBIT_SIGNUP", "invite");
      db.workspaceInvitation.findFirst.mockResolvedValue({ id: "inv" });
      expect(await evaluateSignIn("dev@gmail.com")).toEqual({ allowed: false, error: "EmailDomainNotAllowed" });
      expect(await evaluateSignIn("dev@acme.com")).toEqual({ allowed: true });
    });
  });

  it("SUPER_ADMIN_EMAILS bypass signup mode and domain rules", async () => {
    vi.stubEnv("SUPER_ADMIN_EMAILS", "boss@elsewhere.com");
    vi.stubEnv("ORBIT_SIGNUP", "closed");
    vi.stubEnv("ORBIT_ALLOWED_EMAIL_DOMAINS", "acme.com");
    expect(await evaluateSignIn("Boss@Elsewhere.com")).toEqual({ allowed: true });
  });
});
