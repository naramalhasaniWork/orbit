/**
 * URL patterns make recorded URLs portable across runs: ids in the path
 * become `*`, the query and hash are dropped, and same-origin URLs keep only
 * the path (the environment is fixed by the script's envKey).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC = /^\d+$/;
const OBJECT_ID = /^[0-9a-f]{24}$/i;
/** Long opaque tokens (cuid, nanoid) contain a digit and no separators */
const OPAQUE = /^(?=.*\d)[A-Za-z0-9]{16,}$/;

function isIdSegment(segment: string): boolean {
  return UUID.test(segment) || NUMERIC.test(segment) || OBJECT_ID.test(segment) || OPAQUE.test(segment);
}

function parse(url: string): URL | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

function generalizePath(pathname: string): string {
  const path = pathname
    .split("/")
    .map((segment) => (isIdSegment(segment) ? "*" : segment))
    .join("/");
  return path.length > 1 ? path.replace(/\/$/, "") : path;
}

export function toUrlPattern(url: string, environmentUrl: string): string {
  const parsed = parse(url);
  if (!parsed) return url;
  const env = parse(environmentUrl);
  const origin = env && env.origin === parsed.origin ? "" : parsed.origin;
  return origin + generalizePath(parsed.pathname);
}

export function urlMatchesPattern(url: string, pattern: string, environmentUrl: string): boolean {
  const actual = toUrlPattern(url, environmentUrl).split("/");
  const expected = pattern.split("/");
  if (actual.length !== expected.length) return false;
  return expected.every((segment, i) => segment === "*" || segment === actual[i]);
}

/** Navigation targets are stored relative to the environment when same-origin. */
export function toStoredUrl(target: string, environmentUrl: string): string {
  const parsed = parse(target);
  const env = parse(environmentUrl);
  if (!parsed || !env || parsed.origin !== env.origin) return target;
  return parsed.pathname + parsed.search + parsed.hash;
}

const DYNAMIC = /^(\[.+\]|:.+)$/;
const CATCH_ALL = /^\[\[?\.\.\..+\]\]?$/;

function segments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

/** Does a route definition ("/projects/[id]", "/users/:id", "/docs/[...slug]") cover a URL pattern? */
export function routeCoversPattern(route: string, pattern: string): boolean {
  const routeSegs = segments(route);
  const patternSegs = segments(pattern);
  for (let i = 0; i < routeSegs.length; i++) {
    const seg = routeSegs[i];
    if (CATCH_ALL.test(seg)) return patternSegs.length >= i + (seg.startsWith("[[") ? 0 : 1);
    const actual = patternSegs[i];
    if (actual === undefined) return false;
    if (DYNAMIC.test(seg)) continue;
    if (seg !== actual) return false;
  }
  return routeSegs.length === patternSegs.length;
}
