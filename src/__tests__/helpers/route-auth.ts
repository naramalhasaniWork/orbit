import { vi } from "vitest";
import type { MemberRole } from "@/lib/auth/permissions";
import { AuthError } from "@/server/http/errors";

/**
 * Stand-in for "who is calling" in route tests. Routes built with route() run for real
 * (permission table included); only the session and the membership read are faked.
 * Change `routeAuth` per test, e.g. `routeAuth.role = "viewer"` to see a 403.
 */
export const routeAuth = {
  userId: "user-1",
  workspaceId: "ws-1" as string | undefined,
  role: "owner" as MemberRole,
  /** false: the user is not a member of the workspace. */
  member: true,
};

export function resetRouteAuth(): void {
  Object.assign(routeAuth, { userId: "user-1", workspaceId: "ws-1", role: "owner", member: true });
}

/** Factory for vi.mock("@/server/http/session", ...). */
export function sessionMock() {
  const session = () => ({
    user: { id: routeAuth.userId },
    workspaceId: routeAuth.workspaceId,
    role: routeAuth.role,
  });
  return { getServerSession: vi.fn(async () => session()), requireAuth: vi.fn(async () => session()) };
}

/** Factory for vi.mock("@/server/http/auth", ...): the real module with the membership read faked. */
export function authMock(original: Record<string, unknown>) {
  return {
    ...original,
    loadMembership: vi.fn(async () => {
      if (!routeAuth.member) throw new AuthError("Not a member of this workspace", "FORBIDDEN", 403);
      return { memberId: "member-1", role: routeAuth.role };
    }),
  };
}
