/**
 * Client-side helpers for calling Orbit's API routes. Routes answer
 * { success: false, error: { message, code } } on failure (see
 * lib/utils/api.ts); some older routes answer { error: "message" }.
 */

interface ApiErrorBody {
  error?: string | { message?: string; code?: string };
}

/** The user-facing message for a failed response, never empty. */
export async function apiErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  const err = body?.error;
  const message = typeof err === "string" ? err : err?.message;
  return message || `${fallback} (HTTP ${res.status})`;
}

/** Error code from a failed response body, if any. */
export function apiErrorCode(body: unknown): string | undefined {
  const err = (body as ApiErrorBody | null)?.error;
  return typeof err === "object" ? err?.code : undefined;
}
