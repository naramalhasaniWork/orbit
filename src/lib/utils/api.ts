import { getServerSession as nextAuthGetServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
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

export async function requireWorkspace(): Promise<{
  session: OrbitSession;
  workspaceId: string;
}> {
  const session = await requireAuth();

  if (!session.workspaceId) {
    throw new AuthError("No workspace found", "NO_WORKSPACE", 403);
  }

  return { session, workspaceId: session.workspaceId };
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

  console.error("Unhandled API error:", error);
  return apiError("Internal server error", "INTERNAL_ERROR", 500);
}
