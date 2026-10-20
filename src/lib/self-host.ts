/**
 * Self-hosted deployment mode (ORBIT_SELF_HOSTED=true).
 * Disables billing and tier limits, and swaps the marketing landing page for the login screen.
 */

export type SignupMode = "open" | "invite" | "closed";

export function isSelfHosted(): boolean {
  return process.env.ORBIT_SELF_HOSTED === "true";
}

/** ORBIT_SIGNUP, defaulting to "open" on cloud and "invite" when self-hosted. */
export function getSignupMode(): SignupMode {
  const raw = process.env.ORBIT_SIGNUP?.trim().toLowerCase();
  if (raw === "open" || raw === "invite" || raw === "closed") return raw;
  return isSelfHosted() ? "invite" : "open";
}

/** ORBIT_ALLOWED_EMAIL_DOMAINS as a lowercase list; empty means no domain restriction. */
export function getAllowedEmailDomains(): string[] {
  return (process.env.ORBIT_ALLOWED_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}
