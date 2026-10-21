import { describe, it, expect } from "vitest";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { getEeLicense, hasEeLicense, verifyLicenseKey, type EeLicense } from "@/ee/license-key";

function keypair(): { privateKey: KeyObject; publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const x = publicKey.export({ format: "jwk" }).x;
  if (!x) throw new Error("no public key bytes");
  return { privateKey, publicKey: Buffer.from(x, "base64url").toString("base64") };
}

function issue(license: EeLicense, privateKey: KeyObject): string {
  const payload = Buffer.from(JSON.stringify(license)).toString("base64url");
  return `${payload}.${sign(null, Buffer.from(payload), privateKey).toString("base64url")}`;
}

const NOW = new Date("2026-10-20T00:00:00Z");
const LICENSE: EeLicense = { licensee: "Acme Inc", seats: 10, expiresAt: "2027-10-20T00:00:00Z" };
const issuer = keypair();

describe("ee license key", () => {
  it("accepts a key signed by the matching private key", () => {
    const check = verifyLicenseKey(issue(LICENSE, issuer.privateKey), issuer.publicKey, NOW);
    expect(check).toEqual({ valid: true, license: LICENSE });
  });

  it("rejects an expired key", () => {
    const key = issue({ ...LICENSE, expiresAt: "2026-10-19T23:59:59Z" }, issuer.privateKey);
    expect(verifyLicenseKey(key, issuer.publicKey, NOW)).toEqual({ valid: false, reason: "expired" });
  });

  it("rejects a key signed by a different private key", () => {
    const key = issue(LICENSE, keypair().privateKey);
    expect(verifyLicenseKey(key, issuer.publicKey, NOW)).toEqual({ valid: false, reason: "bad_signature" });
  });

  it("rejects a payload edited after signing", () => {
    const [, signature] = issue(LICENSE, issuer.privateKey).split(".");
    const forged = Buffer.from(JSON.stringify({ ...LICENSE, seats: 1000 })).toString("base64url");
    expect(verifyLicenseKey(`${forged}.${signature}`, issuer.publicKey, NOW)).toEqual({ valid: false, reason: "bad_signature" });
  });

  it("reports a missing key, a missing public key and a malformed key", () => {
    expect(verifyLicenseKey(undefined, issuer.publicKey, NOW)).toEqual({ valid: false, reason: "missing" });
    expect(verifyLicenseKey("  ", issuer.publicKey, NOW)).toEqual({ valid: false, reason: "missing" });
    expect(verifyLicenseKey(issue(LICENSE, issuer.privateKey), undefined, NOW)).toEqual({ valid: false, reason: "no_public_key" });
    expect(verifyLicenseKey("not-a-key", issuer.publicKey, NOW)).toEqual({ valid: false, reason: "malformed" });
  });

  it("reads the key and public key from env", () => {
    const env = { ORBIT_EE_LICENSE_KEY: issue(LICENSE, issuer.privateKey), ORBIT_EE_PUBLIC_KEY: issuer.publicKey };
    expect(getEeLicense(env, NOW).valid).toBe(true);
    expect(hasEeLicense({ ...env, NODE_ENV: "production" }, NOW)).toBe(true);
    expect(hasEeLicense({ ORBIT_EE_PUBLIC_KEY: issuer.publicKey, NODE_ENV: "production" }, NOW)).toBe(false);
  });

  it("is always on in local development", () => {
    expect(hasEeLicense({ NODE_ENV: "development" }, NOW)).toBe(true);
  });
});
