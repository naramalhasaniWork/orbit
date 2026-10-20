import { getServerSession as nextAuthGetServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
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

/** A dependency (Redis, the job queue) is down; the request can be retried. */
export class ServiceUnavailableError extends Error {
  code: string;

  constructor(message: string, code = "SERVICE_UNAVAILABLE") {
    super(message);
    this.code = code;
    this.name = "ServiceUnavailableError";
  }
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return apiError(error.message, error.code, error.status);
  }

  if (error instanceof ServiceUnavailableError) {
    const res = apiError(error.message, error.code, 503);
    res.headers.set("Retry-After", "30");
    return res;
  }

  if (error instanceof ZodError) {
    const firstError = error.errors[0]?.message ?? "Validation failed";
    return apiError(firstError, "VALIDATION_ERROR", 400);
  }

  // Prisma 7: record not found (findUniqueOrThrow, update/delete of a
  // missing row) and unique-constraint violations
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") {
      return apiError("Resource not found", "NOT_FOUND", 404);
    }
    if (error.code === "P2002") {
      return apiError("A record with these details already exists", "CONFLICT", 409);
    }
  }

  console.error("Unhandled API error:", error);
  return apiError("Internal server error", "INTERNAL_ERROR", 500);
}
