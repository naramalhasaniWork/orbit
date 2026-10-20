import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { encrypt, decrypt } from "@/lib/vault";
import type { PreviewProviderId, ProviderAccess } from "./types";

interface StoredCredentials {
  encryptedToken?: string;
  iv?: string;
}

interface ConnectionRow {
  credentials: Prisma.JsonValue;
  config: Prisma.JsonValue;
}

/** Decrypt a connection's API token. Null when it is missing or cannot be decrypted. */
export function connectionAccess(connection: ConnectionRow): ProviderAccess | null {
  const creds = (connection.credentials ?? {}) as StoredCredentials;
  if (!creds.encryptedToken || !creds.iv) return null;
  try {
    const token = decrypt(creds.encryptedToken, creds.iv);
    return { token, config: (connection.config ?? {}) as Record<string, unknown> };
  } catch {
    console.warn("[preview] Failed to decrypt a preview connection token");
    return null;
  }
}

export function encryptCredentials(token: string): Prisma.InputJsonValue {
  const { encrypted, iv } = encrypt(token);
  return { encryptedToken: encrypted, iv };
}

// -- Webhook token (X-Orbit-Token) --

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

// -- Queries --

export function findConnection(workspaceId: string, provider: PreviewProviderId, label = "default") {
  return prisma.previewConnection.findUnique({
    where: { preview_connection_unique: { workspaceId, provider, label } },
  });
}

/** The path a provider posts webhooks to; the caller prefixes the public origin. */
export function webhookPath(provider: PreviewProviderId, connectionId: string): string {
  return `/api/webhooks/preview/${provider}/${connectionId}`;
}
