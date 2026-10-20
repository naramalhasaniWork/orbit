/**
 * Open-redirect guard: only same-site relative paths are accepted.
 */

const DEFAULT_RETURN_PATH = "/dashboard/onboarding";

/**
 * Returns `value` if it is a relative path ("/foo"), otherwise `fallback`.
 * Rejects protocol-relative ("//host"), backslash variants ("/\host") and any
 * control character, since browsers strip tabs/newlines and treat "\" as "/".
 */
export function safeReturnPath(
  value: string | null | undefined,
  fallback: string = DEFAULT_RETURN_PATH
): string {
  if (!value || !value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.includes("\\")) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}
