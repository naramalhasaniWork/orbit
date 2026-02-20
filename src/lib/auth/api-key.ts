import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface ApiKeyAuth {
  workspaceId: string;
  projectId?: string;
}

/**
 * Hash an API key for comparison (we never store plaintext keys).
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Validate an API key from the Authorization header.
 * API keys are scoped to workspaces and stored as hashes.
 */
export async function validateApiKey(
  req: NextRequest
): Promise<ApiKeyAuth | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  if (!token) return null;

  const keyHash = hashApiKey(token);

  // Check workspace-level API keys stored in workspace settings
  const workspaces = await prisma.workspace.findMany({
    select: { id: true, settings: true },
  });

  for (const ws of workspaces) {
    const settings = ws.settings as Record<string, unknown>;
    const storedHash = settings?.apiKeyHash as string | undefined;
    if (storedHash && storedHash === keyHash) {
      return { workspaceId: ws.id };
    }
  }

  return null;
}

/**
 * Middleware that requires API key auth and returns an error response if invalid.
 */
export async function requireApiKey(
  req: NextRequest
): Promise<ApiKeyAuth | NextResponse> {
  const auth = await validateApiKey(req);

  if (!auth) {
    return NextResponse.json(
      { error: "Invalid or missing API key" },
      { status: 401 }
    );
  }

  return auth;
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
