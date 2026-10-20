import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError, ServiceUnavailableError } from "@/server/http/errors";
import { requireAuth } from "@/server/http/session";
import type { OrbitSession } from "@/lib/utils/types";

interface ApiError {
  message: string;
  code: string;
  [extra: string]: unknown;
}

// Session and membership logic lives in server/http; re-exported for routes not yet on route().
export { getServerSession, requireAuth } from "@/server/http/session";
export { requireWorkspace } from "@/server/http/auth";
export { AuthError, ServiceUnavailableError };

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
  status = 400,
  extra?: Record<string, unknown>
): NextResponse {
  const error: ApiError = { message, code, ...extra };
  return NextResponse.json({ success: false, error }, { status });
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
