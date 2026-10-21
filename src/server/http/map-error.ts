import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { apiError } from "@/lib/utils/api";
import type { Logger } from "pino";
import {
  AuthError,
  HttpError,
  NotFoundError,
  ServiceUnavailableError,
} from "./errors";

/** Prisma 7 errors carry a string `code`; matched by name so this file needs no generated-client import. */
function prismaCode(error: unknown): string | undefined {
  if (!(error instanceof Error) || error.name !== "PrismaClientKnownRequestError") return undefined;
  const { code } = error as Error & { code?: unknown };
  return typeof code === "string" ? code : undefined;
}

/** Next signals dynamic rendering, redirect() and notFound() by throwing; those must reach Next untouched. */
function isNextControlFlow(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const { digest } = error as Error & { digest?: unknown };
  return (
    typeof digest === "string" &&
    (digest === "DYNAMIC_SERVER_USAGE" || digest === "NEXT_NOT_FOUND" || digest.startsWith("NEXT_REDIRECT"))
  );
}

/**
 * Turn anything a handler throws into the `{success: false, error}` response.
 * Unknown errors are logged with the request id and answered with only that id:
 * their message never reaches the client.
 */
export function mapError(error: unknown, requestId: string, log: Logger): NextResponse {
  if (isNextControlFlow(error)) throw error;

  if (error instanceof ZodError) {
    const issues = error.issues.map((i) => ({ path: i.path.join("."), message: i.message, code: i.code }));
    return apiError(issues[0]?.message ?? "Validation failed", "VALIDATION_ERROR", 400, { details: issues });
  }

  if (error instanceof AuthError || error instanceof HttpError) {
    return apiError(error.message, error.code, error.status);
  }

  if (error instanceof NotFoundError) {
    return apiError(error.message, "NOT_FOUND", 404);
  }

  const code = prismaCode(error);
  if (code === "P2025") return apiError("Resource not found", "NOT_FOUND", 404);
  if (code === "P2002") {
    return apiError("A record with these details already exists", "CONFLICT", 409);
  }

  // Matched by name: the AI gateway owns BudgetExceededError, and this layer must not import from it.
  if (error instanceof Error && error.name === "BudgetExceededError") {
    return apiError(error.message, "BUDGET_EXCEEDED", 402);
  }

  if (error instanceof ServiceUnavailableError) {
    const res = apiError(error.message, error.code, 503);
    res.headers.set("Retry-After", String(error.retryAfterSec));
    return res;
  }

  log.error({ err: error }, "Unhandled API error");
  return apiError("Internal server error", "INTERNAL_ERROR", 500, { requestId });
}
