/**
 * What a bug report carries besides the message. Built in the browser, sanitised again on the
 * server: only these keys survive, URLs lose their query and hash, and anything shaped like a
 * credential is redacted. Input values, cookies and storage are never read in the first place.
 */

export const MAX_CONSOLE_ERRORS = 20;
const MAX_ERROR_CHARS = 1000;
const MAX_UA_CHARS = 512;
const MAX_PATH_CHARS = 512;
const REDACTED = "[redacted]";

export interface BugReportClientContext {
  path: string;
  userAgent: string;
  viewport: { width: number; height: number } | null;
  consoleErrors: string[];
}

export interface BugReportContext extends BugReportClientContext {
  appVersion: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\b(bearer|basic)\s+[\w.~+/=-]+/gi, `$1 ${REDACTED}`],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]*/g, REDACTED], // JWT
  [/\b(?:sk|pk|rk)[-_](?:live|test|proj|ant)?[-_]?[\w-]{12,}/g, REDACTED],
  [/\b(?:ghp|gho|ghu|ghs|ghr|github_pat|xox[abposr]|orb|whsec)_[\w-]{8,}/g, REDACTED],
  [
    /\b(token|access_token|refresh_token|id_token|secret|password|passwd|api[_-]?key|apikey|authorization|cookie|set-cookie|session|sig|signature|code|key)(["']?\s*[:=]\s*["']?)[^\s"'&;,]+/gi,
    `$1$2${REDACTED}`,
  ],
];

/** A long opaque run of letters and digits is treated as a credential; UUIDs and plain words are kept. */
function redactOpaque(text: string): string {
  return text.replace(/[A-Za-z0-9_+=-]{32,}/g, (run) =>
    UUID.test(run) || !/\d/.test(run) || !/[A-Za-z]/.test(run) ? run : REDACTED
  );
}

export function redactSecrets(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement);
  return redactOpaque(out);
}

/** Path only: no origin, query or hash (they carry tokens: invite links, OAuth callbacks). */
export function sanitizePath(raw: unknown): string {
  if (typeof raw !== "string" || !raw) return "/";
  let pathname: string;
  try {
    pathname = new URL(raw, "http://orbit.local").pathname;
  } catch {
    return "/";
  }
  return redactOpaque(pathname).slice(0, MAX_PATH_CHARS);
}

function clampDimension(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.min(Math.round(value), 20_000) : null;
}

function sanitizeViewport(raw: unknown): BugReportClientContext["viewport"] {
  if (!raw || typeof raw !== "object") return null;
  const { width, height } = raw as Record<string, unknown>;
  const w = clampDimension(width);
  const h = clampDimension(height);
  return w && h ? { width: w, height: h } : null;
}

function sanitizeErrors(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is string => typeof e === "string" && e.length > 0)
    .slice(-MAX_CONSOLE_ERRORS)
    .map((e) => redactSecrets(e.slice(0, MAX_ERROR_CHARS)));
}

/** Keep the known keys, in the known shapes; everything else the client sent is dropped. */
export function sanitizeClientContext(raw: unknown): BugReportClientContext {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    path: sanitizePath(input.path),
    userAgent: typeof input.userAgent === "string" ? input.userAgent.slice(0, MAX_UA_CHARS) : "",
    viewport: sanitizeViewport(input.viewport),
    consoleErrors: sanitizeErrors(input.consoleErrors),
  };
}
