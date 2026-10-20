import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { AuthError, ServiceUnavailableError } from "@/server/http/errors";
import { mapError } from "@/server/http/map-error";
import { logger } from "@/server/observability/logger";
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

/** For routes not yet on route(): same mapping, with a fresh request id for the 500 case. */
export function handleApiError(error: unknown): NextResponse {
  return mapError(error, randomUUID(), logger);
}
