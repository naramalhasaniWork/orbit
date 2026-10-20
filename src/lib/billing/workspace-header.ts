import type { NextRequest } from "next/server";
import { AuthError, getServerSession } from "@/lib/utils/api";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Workspace for a billing request: the `x-workspace-id` header when present
 * (must be a uuid, else 400), otherwise the session's workspace. Membership and
 * permission are still enforced by requirePermission on the returned id.
 */
export async function billingWorkspaceId(request: NextRequest): Promise<string> {
  const header = request.headers.get("x-workspace-id")?.trim();
  if (header) {
    if (!UUID_PATTERN.test(header)) {
      throw new AuthError("x-workspace-id must be a valid workspace id", "VALIDATION_ERROR", 400);
    }
    return header;
  }

  const session = await getServerSession();
  if (!session) throw new AuthError("Authentication required", "UNAUTHORIZED", 401);
  if (!session.workspaceId) throw new AuthError("No workspace found", "NO_WORKSPACE", 403);
  return session.workspaceId;
}
