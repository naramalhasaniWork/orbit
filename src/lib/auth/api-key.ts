import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "./rate-limit";
import type { WorkspaceTier } from "./tenant";

interface ApiKeyAuth {
  workspaceId: string;
  projectId?: string;
}

export const API_KEY_PREFIX = "orb_";
const PREFIX_DISPLAY_LENGTH = 12;
const LAST_USED_THROTTLE_MS = 60_000;

/**
 * Hash an API key for comparison (we never store plaintext keys).
 * Keys are 256 bits of randomness, so a plain SHA-256 is sufficient.
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Generate a new key. The plaintext is shown to the user once and never stored. */
export function generateApiKey(): { key: string; prefix: string; keyHash: string } {
  const key = `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { key, prefix: key.slice(0, PREFIX_DISPLAY_LENGTH), keyHash: hashApiKey(key) };
}

interface ResolvedKey extends ApiKeyAuth {
  tier: WorkspaceTier;
}

/** Indexed lookup of a Bearer token by its hash. Null if unknown, revoked or workspace deleted. */
async function resolveApiKey(req: NextRequest): Promise<ResolvedKey | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;

  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  if (!token) return null;

  const record = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(token) },
    select: {
      id: true,
      workspaceId: true,
      revokedAt: true,
      lastUsedAt: true,
      workspace: { select: { tier: true, deletedAt: true } },
    },
  });

  if (!record || record.revokedAt || record.workspace.deletedAt) return null;

  const now = Date.now();
  if (!record.lastUsedAt || now - record.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
    prisma.apiKey
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date(now) } })
      .catch(() => {});
  }

  return { workspaceId: record.workspaceId, tier: record.workspace.tier };
}

/**
 * Authenticate and rate limit an API-key request. Returns the auth context,
 * or a ready-to-return 401/429 response.
 */
export async function requireApiKey(
  req: NextRequest
): Promise<ApiKeyAuth | NextResponse> {
  const resolved = await resolveApiKey(req);

  if (!resolved) {
    return NextResponse.json(
      { error: "Invalid or missing API key" },
      { status: 401 }
    );
  }

  const limited = await checkRateLimit(resolved.workspaceId, resolved.tier);
  if (limited) return limited;

  return { workspaceId: resolved.workspaceId };
}

/**
 * Verify that a project belongs to the authenticated workspace.
 */
export async function verifyProjectAccess(
  workspaceId: string,
  projectId: string
): Promise<boolean> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true },
  });

  return project !== null;
}
