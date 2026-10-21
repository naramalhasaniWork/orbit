import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { workspace: { findUnique } } }));

import { hasEeFeature, tierHasEeFeature } from "@/ee/entitlement";

const NOW_FUTURE = "2099-01-01T00:00:00Z";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const testPublicKey = publicKey.export({ format: "jwk" }).x ?? "";
const payload = Buffer.from(JSON.stringify({ licensee: "Acme", seats: 5, expiresAt: NOW_FUTURE })).toString("base64url");
const licenseKey = `${payload}.${sign(null, Buffer.from(payload), privateKey).toString("base64url")}`;

const HOSTED = { NODE_ENV: "production" };
const SELF_HOSTED = { NODE_ENV: "production", ORBIT_SELF_HOSTED: "true" };
// The test-mode public key override lets a generated keypair stand in for the official one.
const SELF_HOSTED_LICENSED = { NODE_ENV: "test", ORBIT_SELF_HOSTED: "true", ORBIT_EE_PUBLIC_KEY: testPublicKey, ORBIT_EE_LICENSE_KEY: licenseKey };

beforeEach(() => findUnique.mockReset());

describe("ee entitlement on hosted Orbit", () => {
  it("enables audit export for Team (professional) and Enterprise only", () => {
    expect(tierHasEeFeature("professional", "audit_export", HOSTED)).toBe(true);
    expect(tierHasEeFeature("enterprise", "audit_export", HOSTED)).toBe(true);
    expect(tierHasEeFeature("starter", "audit_export", HOSTED)).toBe(false);
    expect(tierHasEeFeature("free", "audit_export", HOSTED)).toBe(false);
  });

  it("ignores a license key: a free workspace stays off even with a valid key", () => {
    const env = { ...SELF_HOSTED_LICENSED, ORBIT_SELF_HOSTED: "" };
    expect(tierHasEeFeature("free", "audit_export", env)).toBe(false);
  });

  it("looks up the workspace tier by id", async () => {
    findUnique.mockResolvedValueOnce({ tier: "professional" });
    expect(await hasEeFeature({ workspaceId: "w1" }, "audit_export", HOSTED)).toBe(true);
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "w1" }, select: { tier: true } });

    findUnique.mockResolvedValueOnce({ tier: "free" });
    expect(await hasEeFeature({ workspaceId: "w2" }, "audit_export", HOSTED)).toBe(false);

    findUnique.mockResolvedValueOnce(null);
    expect(await hasEeFeature({ workspaceId: "gone" }, "audit_export", HOSTED)).toBe(false);
  });

  it("enables operator-level (instance) export for the hosted operator", async () => {
    expect(await hasEeFeature("instance", "audit_export", HOSTED)).toBe(true);
  });
});

describe("ee entitlement when self-hosted", () => {
  it("is off without a license key, whatever the workspace plan", async () => {
    expect(tierHasEeFeature("enterprise", "audit_export", SELF_HOSTED)).toBe(false);
    expect(await hasEeFeature("instance", "audit_export", SELF_HOSTED)).toBe(false);
    expect(await hasEeFeature({ workspaceId: "w1" }, "audit_export", SELF_HOSTED)).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("is on for every workspace with a valid license key", async () => {
    expect(tierHasEeFeature("free", "audit_export", SELF_HOSTED_LICENSED)).toBe(true);
    expect(await hasEeFeature({ workspaceId: "w1" }, "audit_export", SELF_HOSTED_LICENSED)).toBe(true);
    expect(await hasEeFeature("instance", "audit_export", SELF_HOSTED_LICENSED)).toBe(true);
  });

  it("rejects a self-signed key in production", () => {
    expect(tierHasEeFeature("free", "audit_export", { ...SELF_HOSTED_LICENSED, NODE_ENV: "production" })).toBe(false);
  });
});

describe("ee entitlement in local development", () => {
  it("is always on", async () => {
    expect(tierHasEeFeature("free", "audit_export", { NODE_ENV: "development" })).toBe(true);
    expect(await hasEeFeature({ workspaceId: "w1" }, "audit_export", { NODE_ENV: "development", ORBIT_SELF_HOSTED: "true" })).toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
