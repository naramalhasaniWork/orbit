import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Set env var before importing vault
const TEST_KEY = "a".repeat(64); // 64 hex chars = 32 bytes
process.env.ENCRYPTION_KEY = TEST_KEY;

// We need to reset the module between tests because derivedKey is cached
let encrypt: typeof import("@/lib/vault")["encrypt"];
let decrypt: typeof import("@/lib/vault")["decrypt"];

describe("vault encrypt/decrypt", () => {
  beforeEach(async () => {
    // Reset the cached key by re-importing the module
    vi.resetModules();
    const vault = await import("@/lib/vault");
    encrypt = vault.encrypt;
    decrypt = vault.decrypt;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("encrypts and decrypts a string roundtrip", () => {
    const plaintext = "my-secret-api-key-12345";
    const { encrypted, iv } = encrypt(plaintext);
    const result = decrypt(encrypted, iv);
    expect(result).toBe(plaintext);
  });

  it("produces different IVs for each encryption", () => {
    const plaintext = "same-text";
    const result1 = encrypt(plaintext);
    const result2 = encrypt(plaintext);

    expect(result1.iv).not.toBe(result2.iv);
    expect(result1.encrypted).not.toBe(result2.encrypted);
  });

  it("decrypts correctly despite different IVs", () => {
    const plaintext = "another-secret";
    const r1 = encrypt(plaintext);
    const r2 = encrypt(plaintext);

    expect(decrypt(r1.encrypted, r1.iv)).toBe(plaintext);
    expect(decrypt(r2.encrypted, r2.iv)).toBe(plaintext);
  });

  it("handles empty string", () => {
    const { encrypted, iv } = encrypt("");
    expect(decrypt(encrypted, iv)).toBe("");
  });

  it("handles unicode text", () => {
    const plaintext = "secreto-123 \u{1F512} \u00FC\u00F6\u00E4";
    const { encrypted, iv } = encrypt(plaintext);
    expect(decrypt(encrypted, iv)).toBe(plaintext);
  });

  it("handles long plaintext", () => {
    const plaintext = "x".repeat(10_000);
    const { encrypted, iv } = encrypt(plaintext);
    expect(decrypt(encrypted, iv)).toBe(plaintext);
  });

  it("throws on tampered ciphertext", () => {
    const { encrypted, iv } = encrypt("original");
    const tampered = "ff" + encrypted.slice(2);
    expect(() => decrypt(tampered, iv)).toThrow();
  });

  it("throws on wrong IV", () => {
    const { encrypted } = encrypt("original");
    const wrongIv = "00".repeat(16);
    expect(() => decrypt(encrypted, wrongIv)).toThrow();
  });

  it("throws when ENCRYPTION_KEY is not set", async () => {
    vi.resetModules();
    delete process.env.ENCRYPTION_KEY;

    const vault = await import("@/lib/vault");
    expect(() => vault.encrypt("test")).toThrow("ENCRYPTION_KEY");

    // Restore for other tests
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  it("derives key from non-hex passphrase via scrypt", async () => {
    vi.resetModules();
    process.env.ENCRYPTION_KEY = "my-passphrase-not-hex";

    const vault = await import("@/lib/vault");
    const { encrypted, iv } = vault.encrypt("scrypt-test");
    expect(vault.decrypt(encrypted, iv)).toBe("scrypt-test");

    // Restore
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });
});
