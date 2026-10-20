/**
 * Sign-in / sign-up gate, enforced in the NextAuth signIn callback.
 *
 * ORBIT_SIGNUP: open (anyone) | invite (needs a pending invitation) | closed (no new accounts).
 * Default is open on cloud and invite when self-hosted. Existing users can always sign in
 * (subject to the domain allowlist). A self-hosted instance with no users yet always lets the
 * first person in so it can be bootstrapped, and SUPER_ADMIN_EMAILS bypass every rule.
 * ORBIT_ALLOWED_EMAIL_DOMAINS, when set, restricts every sign-in to those domains.
 */

import { prisma } from "@/lib/db";
import { getAllowedEmailDomains, getSignupMode, isSelfHosted } from "@/lib/self-host";

export type SignInDecision =
  | { allowed: true }
  | { allowed: false; error: "EmailDomainNotAllowed" | "SignupClosed" | "SignupInviteOnly" };

function isSuperAdminEmail(email: string): boolean {
  return (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email);
}

export async function evaluateSignIn(rawEmail: string): Promise<SignInDecision> {
  const email = rawEmail.trim().toLowerCase();

  if (isSuperAdminEmail(email)) return { allowed: true };

  const domains = getAllowedEmailDomains();
  if (domains.length > 0 && !domains.includes(email.split("@").pop() ?? "")) {
    return { allowed: false, error: "EmailDomainNotAllowed" };
  }

  const mode = getSignupMode();
  if (mode === "open") return { allowed: true };

  // Providers may return mixed-case emails, which is how the adapter stored the user.
  const existing = await prisma.user.findFirst({
    where: { email: { in: [rawEmail, email] } },
    select: { id: true },
  });
  if (existing) return { allowed: true };

  if (isSelfHosted() && (await prisma.user.count()) === 0) return { allowed: true };

  if (mode === "closed") return { allowed: false, error: "SignupClosed" };

  const invitation = await prisma.workspaceInvitation.findFirst({
    where: { email, status: "pending", expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  return invitation ? { allowed: true } : { allowed: false, error: "SignupInviteOnly" };
}
