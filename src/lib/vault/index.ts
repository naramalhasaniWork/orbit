import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

interface EncryptedPayload {
  encrypted: string;
  iv: string;
}

let derivedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (derivedKey) return derivedKey;

  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }

  // If the key is exactly 64 hex chars (32 bytes), use it directly
  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    derivedKey = Buffer.from(rawKey, "hex");
  } else {
    // Derive a 32-byte key using scrypt with a fixed salt
    // The salt is fixed so the same passphrase always produces the same key
    const salt = "orbit-vault-key-derivation";
    derivedKey = scryptSync(rawKey, salt, KEY_LENGTH);
  }

  return derivedKey;
}

export function encrypt(plaintext: string): EncryptedPayload {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");

  // Store auth tag appended to the ciphertext
  return {
    encrypted: encrypted + authTag,
    iv: iv.toString("hex"),
  };
}

export function decrypt(encrypted: string, iv: string): string {
  const key = getEncryptionKey();
  const ivBuffer = Buffer.from(iv, "hex");

  // Extract auth tag from end of ciphertext
  const authTag = Buffer.from(
    encrypted.slice(-AUTH_TAG_LENGTH * 2),
    "hex"
  );
  const ciphertext = encrypted.slice(0, -AUTH_TAG_LENGTH * 2);

  const decipher = createDecipheriv(ALGORITHM, key, ivBuffer, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
