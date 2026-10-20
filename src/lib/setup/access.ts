import { prisma } from "@/lib/db";
import { isSelfHosted } from "@/lib/self-host";

export type SetupAccess = "show" | "login" | "dashboard";

/**
 * Who may see /setup: only a self-hosted instance with no users yet. Everyone
 * else is sent to the dashboard (signed in) or the login page.
 */
export function getSetupAccess(input: {
  selfHosted: boolean;
  userCount: number;
  signedIn: boolean;
}): SetupAccess {
  if (input.selfHosted && input.userCount === 0 && !input.signedIn) return "show";
  return input.signedIn ? "dashboard" : "login";
}

/**
 * Number of users, or 0 when the database cannot be queried. Failing open is
 * deliberate: a first deploy with a broken DATABASE_URL is exactly when the
 * operator needs the checklist, and the page shows only pass/fail and the
 * instance's own public URLs.
 */
export async function countUsersOrZero(): Promise<number> {
  try {
    return await prisma.user.count();
  } catch {
    return 0;
  }
}

/** True while the first-run setup flow (and its API routes) may be used. */
export async function isSetupOpen(): Promise<boolean> {
  if (!isSelfHosted()) return false;
  return getSetupAccess({ selfHosted: true, userCount: await countUsersOrZero(), signedIn: false }) === "show";
}

/** Public origin of this request, honouring the proxy headers Railway sets. */
export function requestOrigin(headers: { get(name: string): string | null }): string {
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost:3000";
  const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host.split(",")[0].trim()}`;
}
