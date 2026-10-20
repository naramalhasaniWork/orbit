import { getServerSession as nextAuthGetServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { OrbitSession } from "@/lib/utils/types";

interface ApiError {
  message: string;
  code: string;
}

export async function getServerSession(): Promise<OrbitSession | null> {
  const session = await nextAuthGetServerSession(authOptions);
  if (!session?.user) return null;

  return session as OrbitSession;
}

export async function requireAuth(): Promise<OrbitSession> {
  const session = await getServerSession();

  if (!session) {
    throw new AuthError("Authentication required", "UNAUTHORIZED", 401);
  }

  return session;
}

/**
 * The session's workspace, with membership and role re-read from the database on
 * every call. The JWT lives for hours, so it must not decide who is still a member
 * or what role they hold.
 */
export async function requireWorkspace(): Promise<{
  session: OrbitSession;
  workspaceId: string;
  role: string;
}> {
  const session = await requireAuth();

  if (!session.workspaceId) {
    throw new AuthError("No workspace found", "NO_WORKSPACE", 403);
  }

  const member = await prisma.workspaceMember.findUnique({
    where: {
      workspace_member_unique: {
        workspaceId: session.workspaceId,
        userId: session.user.id,
      },
      // A soft-deleted workspace admits nobody
      workspace: { deletedAt: null },
    },
    select: { role: true, workspace: { select: { deletedAt: true } } },
  });

  if (!member) {
    throw new AuthError("Not a member of this workspace", "FORBIDDEN", 403);
  }
  if (member.workspace.deletedAt) {
    throw new AuthError("Workspace has been deleted", "WORKSPACE_DELETED", 403);
  }

  return {
    session: { ...session, role: member.role },
    workspaceId: session.workspaceId,
    role: member.role,
  };
}

export async function requireSuperAdmin(): Promise<OrbitSession> {
  const session = await requireAuth();

  if (session.userRole !== "super_admin") {
    throw new AuthError("Super admin access required", "FORBIDDEN", 403);
  }

  return session;
}

export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status });
}

export function apiError(
  message: string,
  code: string,
  status = 400
): NextResponse {
  const error: ApiError = { message, code };
  return NextResponse.json({ success: false, error }, { status });
}

export class AuthError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "AuthError";
  }
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return apiError(error.message, error.code, error.status);
  }

  if (error instanceof ZodError) {
    const firstError = error.errors[0]?.message ?? "Validation failed";
    return apiError(firstError, "VALIDATION_ERROR", 400);
  }

  // Handle Prisma "not found" errors
  if (
    error instanceof Error &&
    error.name === "NotFoundError"
  ) {
    return apiError("Resource not found", "NOT_FOUND", 404);
  }

  console.error("Unhandled API error:", error);
  return apiError("Internal server error", "INTERNAL_ERROR", 500);
}
