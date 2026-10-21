/**
 * Orbit Enterprise license-key gate. Licensed under src/ee/LICENSE, not the AGPL.
 *
 * A license key is `base64url(JSON payload).base64url(Ed25519 signature over the payload segment)`.
 * Verification is offline: no network calls, only the official public key below.
 * Keys are issued with scripts/ee/issue-license.ts and the private key, which never enters this repo.
 */

import { createPublicKey, verify, type KeyObject } from "node:crypto";

export type Env = Record<string, string | undefined>;

/** Official Orbit Enterprise public key (base64url, raw 32-byte Ed25519). */
export const EE_PUBLIC_KEY = "7SzrrRfnri8aH0suLh7StjI9-FSBmBWLWFt_pFqh9SE";

export interface EeLicense {
  licensee: string;
  seats: number;
  /** ISO 8601 timestamp after which the key stops working. */
  expiresAt: string;
}

export type LicenseFailure = "missing" | "no_public_key" | "malformed" | "bad_signature" | "expired";

export type LicenseCheck = { valid: true; license: EeLicense } | { valid: false; reason: LicenseFailure };

/** A base64 (or base64url) raw 32-byte Ed25519 public key. */
function parsePublicKey(raw: string): KeyObject | null {
  const bytes = Buffer.from(raw.trim(), "base64url");
  if (bytes.length !== 32) return null;
  try {
    return createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: bytes.toString("base64url") }, format: "jwk" });
  } catch {
    return null;
  }
}

function parsePayload(segment: string): EeLicense | null {
  try {
    const data: unknown = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
    if (typeof data !== "object" || data === null) return null;
    const { licensee, seats, expiresAt } = data as Record<string, unknown>;
    if (typeof licensee !== "string" || typeof seats !== "number" || typeof expiresAt !== "string") return null;
    if (Number.isNaN(Date.parse(expiresAt))) return null;
    return { licensee, seats, expiresAt };
  } catch {
    return null;
  }
}

export function verifyLicenseKey(key: string | undefined, publicKey: string | undefined, now = new Date()): LicenseCheck {
  if (!key?.trim()) return { valid: false, reason: "missing" };
  const pub = publicKey ? parsePublicKey(publicKey) : null;
  if (!pub) return { valid: false, reason: "no_public_key" };

  const [payloadSegment, signatureSegment, ...rest] = key.trim().split(".");
  if (!payloadSegment || !signatureSegment || rest.length > 0) return { valid: false, reason: "malformed" };

  const signature = Buffer.from(signatureSegment, "base64url");
  if (!verify(null, Buffer.from(payloadSegment), pub, signature)) return { valid: false, reason: "bad_signature" };

  const license = parsePayload(payloadSegment);
  if (!license) return { valid: false, reason: "malformed" };
  if (Date.parse(license.expiresAt) <= now.getTime()) return { valid: false, reason: "expired" };
  return { valid: true, license };
}

/** The official key, or ORBIT_EE_PUBLIC_KEY under NODE_ENV=test only, so a deployment can't trust its own keypair. */
function trustedPublicKey(env: Env): string {
  return env.NODE_ENV === "test" && env.ORBIT_EE_PUBLIC_KEY ? env.ORBIT_EE_PUBLIC_KEY : EE_PUBLIC_KEY;
}

/** Checks ORBIT_EE_LICENSE_KEY against the trusted public key. */
export function getEeLicense(env: Env = process.env, now = new Date()): LicenseCheck {
  return verifyLicenseKey(env.ORBIT_EE_LICENSE_KEY, trustedPublicKey(env), now);
}

/** Enterprise features are on with a valid key, and always on in local development (free under src/ee/LICENSE). */
export function hasEeLicense(env: Env = process.env, now = new Date()): boolean {
  return env.NODE_ENV === "development" || getEeLicense(env, now).valid;
}
