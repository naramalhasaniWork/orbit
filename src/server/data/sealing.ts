/**
 * Sealing lives in the data layer: repos seal credentials on write and open them on read, so
 * nothing above server/data handles ciphertext. lib/vault stays the AES primitive; this file is
 * the only data-layer door to it.
 */
import { decrypt, encrypt } from "@/lib/vault";

export interface SealedSecret {
  encrypted: string;
  iv: string;
}

export function sealSecret(plaintext: string): SealedSecret {
  return encrypt(plaintext);
}

function isSealed(value: unknown): value is SealedSecret {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.encrypted === "string" && typeof v.iv === "string";
}

/**
 * Read a secret stored in a JSON settings blob. Accepts a sealed payload
 * (written by sealSecret) or a legacy plaintext string. Returns null when the
 * value is missing or cannot be decrypted.
 */
export function openSecret(value: unknown): string | null {
  if (typeof value === "string") return value || null;
  if (!isSealed(value)) return null;
  try {
    return decrypt(value.encrypted, value.iv);
  } catch (error) {
    console.warn(
      "[sealing] Failed to decrypt stored secret:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
