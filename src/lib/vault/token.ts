/**
 * Single-column encryption for tokens stored as one string (e.g. User.githubAccessToken).
 *
 * Format: "enc:v1:<iv hex>:<ciphertext+tag hex>". Anything without that prefix is
 * treated as a legacy plaintext value so old rows keep working until the next login
 * rewrites them encrypted.
 */

import { decrypt, encrypt } from "./index";

const PREFIX = "enc:v1:";

export function isEncryptedToken(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

export function encryptToken(plaintext: string): string {
  const { encrypted, iv } = encrypt(plaintext);
  return `${PREFIX}${iv}:${encrypted}`;
}

/**
 * Decrypt a stored token. Legacy plaintext is returned as-is.
 * Returns null if the value is encrypted but cannot be decrypted (wrong key, corruption).
 */
export function decryptToken(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!isEncryptedToken(stored)) return stored;

  const [iv, encrypted] = stored.slice(PREFIX.length).split(":");
  if (!iv || !encrypted) return null;
  try {
    return decrypt(encrypted, iv);
  } catch {
    console.warn("[Vault] Failed to decrypt stored token (wrong ENCRYPTION_KEY or corrupted value)");
    return null;
  }
}
