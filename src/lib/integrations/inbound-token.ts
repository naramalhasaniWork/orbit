import { createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * Per-connection inbound tokens (preview deploy webhooks, Linear webhooks, Slack link
 * codes). Only the sha256 is stored; presented tokens are compared in constant time.
 */

/** A fresh webhook token; only its sha256 is stored. */
export function generateWebhookToken(): { token: string; hash: string } {
  const token = `orbit_wh_${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashWebhookToken(token) };
}

export function hashWebhookToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time comparison of a presented token against the stored hash. Fails closed. */
export function webhookTokenMatches(presented: string | null, storedHash: string | null): boolean {
  if (!presented || !storedHash) return false;
  const a = Buffer.from(hashWebhookToken(presented), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
