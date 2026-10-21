import { describe, it, expect } from "vitest";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { EE_PUBLIC_KEY, getEeLicense, hasEeLicense, verifyLicenseKey, type EeLicense } from "@/ee/license-key";
import { issueLicense, parseLicenseArgs } from "../../../scripts/ee/issue-license";

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

  it("accepts an env public key override in test mode", () => {
    const env = { NODE_ENV: "test", ORBIT_EE_LICENSE_KEY: issue(LICENSE, issuer.privateKey), ORBIT_EE_PUBLIC_KEY: issuer.publicKey };
    expect(getEeLicense(env, NOW).valid).toBe(true);
    expect(hasEeLicense(env, NOW)).toBe(true);
    expect(hasEeLicense({ NODE_ENV: "test", ORBIT_EE_PUBLIC_KEY: issuer.publicKey }, NOW)).toBe(false);
  });

  it("ignores an env public key outside test mode, so a self-signed key is rejected", () => {
    const selfSigned = { ORBIT_EE_LICENSE_KEY: issue(LICENSE, issuer.privateKey), ORBIT_EE_PUBLIC_KEY: issuer.publicKey };
    for (const NODE_ENV of ["production", undefined, "staging"]) {
      expect(getEeLicense({ ...selfSigned, NODE_ENV }, NOW)).toEqual({ valid: false, reason: "bad_signature" });
      expect(hasEeLicense({ ...selfSigned, NODE_ENV }, NOW)).toBe(false);
    }
  });

  it("embeds a well-formed official public key", () => {
    expect(Buffer.from(EE_PUBLIC_KEY, "base64url")).toHaveLength(32);
    expect(verifyLicenseKey("x.y", EE_PUBLIC_KEY, NOW)).toEqual({ valid: false, reason: "bad_signature" });
  });

  it("is always on in local development", () => {
    expect(hasEeLicense({ NODE_ENV: "development" }, NOW)).toBe(true);
  });
});

describe("issue-license script", () => {
  const pem = issuer.privateKey.export({ format: "pem", type: "pkcs8" }).toString();

  it("round-trips: an issued key verifies against the matching public key", () => {
    const { license } = parseLicenseArgs(["key.pem", "Acme Inc", "10", "2027-10-20"]);
    expect(license).toEqual({ licensee: "Acme Inc", seats: 10, expiresAt: "2027-10-20T00:00:00.000Z" });
    expect(verifyLicenseKey(issueLicense(pem, license), issuer.publicKey, NOW)).toEqual({ valid: true, license });
  });

  it("rejects bad arguments and non-Ed25519 keys", () => {
    expect(() => parseLicenseArgs(["key.pem", "Acme"])).toThrow(/usage/);
    expect(() => parseLicenseArgs(["key.pem", "Acme", "0", "2027-10-20"])).toThrow(/seats/);
    expect(() => parseLicenseArgs(["key.pem", "Acme", "5", "soon"])).toThrow(/expiresAt/);
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    expect(() => issueLicense(rsa, LICENSE)).toThrow(/Ed25519/);
  });
});
