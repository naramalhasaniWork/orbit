import { describe, it, expect, beforeEach, vi } from "vitest";

process.env.ENCRYPTION_KEY = "b".repeat(64);

let encryptToken: typeof import("@/lib/vault/token")["encryptToken"];
let decryptToken: typeof import("@/lib/vault/token")["decryptToken"];
let isEncryptedToken: typeof import("@/lib/vault/token")["isEncryptedToken"];

describe("vault token helpers", () => {
  beforeEach(async () => {
    vi.resetModules();
    process.env.ENCRYPTION_KEY = "b".repeat(64);
    ({ encryptToken, decryptToken, isEncryptedToken } = await import("@/lib/vault/token"));
  });

  it("round-trips and does not store the plaintext", () => {
    const stored = encryptToken("gho_abcdef123456");
    expect(isEncryptedToken(stored)).toBe(true);
    expect(stored).not.toContain("gho_abcdef123456");
    expect(decryptToken(stored)).toBe("gho_abcdef123456");
  });

  it("uses a fresh IV each time", () => {
    expect(encryptToken("gho_same")).not.toBe(encryptToken("gho_same"));
  });

  it("returns legacy plaintext rows unchanged", () => {
    expect(isEncryptedToken("gho_legacyplaintext")).toBe(false);
    expect(decryptToken("gho_legacyplaintext")).toBe("gho_legacyplaintext");
  });

  it("returns null for empty values", () => {
    expect(decryptToken(null)).toBeNull();
    expect(decryptToken(undefined)).toBeNull();
    expect(decryptToken("")).toBeNull();
  });

  it("returns null (not a throw) for corrupted ciphertext", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const stored = encryptToken("gho_x");
    expect(decryptToken(stored.slice(0, -4) + "ffff")).toBeNull();
    expect(decryptToken("enc:v1:onlyone")).toBeNull();
  });

  it("returns null when decrypting under a different key", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const stored = encryptToken("gho_x");
    vi.resetModules();
    process.env.ENCRYPTION_KEY = "c".repeat(64);
    const other = await import("@/lib/vault/token");
    expect(other.decryptToken(stored)).toBeNull();
  });
});
