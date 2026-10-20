import { describe, it, expect } from "vitest";
import {
  INVITE_EXPIRY_DAYS,
  isInviteEmailMismatch,
  newInviteExpiry,
  newInviteToken,
  normalizeInviteEmail,
} from "@/lib/invitations";

describe("invitation helpers", () => {
  it("normalizes email case and whitespace", () => {
    expect(normalizeInviteEmail("  A@X.Com ")).toBe("a@x.com");
  });

  it("detects a mismatch only for a signed-in user with a different address", () => {
    expect(isInviteEmailMismatch("a@x.com", "A@X.com")).toBe(false);
    expect(isInviteEmailMismatch("a@x.com", "b@y.com")).toBe(true);
    expect(isInviteEmailMismatch("a@x.com", null)).toBe(false);
  });

  it("issues unique tokens and a future expiry", () => {
    expect(newInviteToken()).not.toBe(newInviteToken());
    const from = new Date("2026-01-01T00:00:00Z");
    expect(newInviteExpiry(from).getTime() - from.getTime()).toBe(INVITE_EXPIRY_DAYS * 86_400_000);
  });
});
