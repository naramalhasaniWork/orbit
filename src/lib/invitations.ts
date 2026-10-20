import { randomBytes } from "crypto";

export const INVITE_EXPIRY_DAYS = 7;

export function newInviteToken(): string {
  return randomBytes(32).toString("hex");
}

export function newInviteExpiry(from: Date = new Date()): Date {
  const expiresAt = new Date(from);
  expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);
  return expiresAt;
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** True when a signed-in user's email differs from the address an invite was sent to. */
export function isInviteEmailMismatch(inviteEmail: string, signedInEmail: string | null | undefined): boolean {
  return !!signedInEmail && normalizeInviteEmail(signedInEmail) !== normalizeInviteEmail(inviteEmail);
}
