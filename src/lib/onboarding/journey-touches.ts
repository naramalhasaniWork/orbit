import { routeCoversPattern } from "@/server/engine/replay/url-pattern";

/**
 * Which System Map routes a planned test touches, read from its steps before it has ever run:
 * every path a step navigates to or expects to land on ("/login", "https://app/x/42"), matched
 * against the map's route nodes. After a run, recorded scripts give the exact list instead.
 */

/** A path at the start of a token, optionally behind an http(s) origin. Selectors never start with "/". */
const PATH = /(?:^|[\s"'`(=])(?:https?:\/\/[^\s/"'`)]+)?(\/[A-Za-z0-9_\-./[\]:*]*)/g;

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}

/** Paths mentioned anywhere in a test's steps, in order, without duplicates. */
export function stepPaths(steps: unknown): string[] {
  const seen = new Set<string>();
  for (const text of strings(steps)) {
    for (const m of Array.from(text.matchAll(PATH))) {
      const path = m[1].replace(/[.:]+$/, "").replace(/(.)\/$/, "$1");
      if (!path.startsWith("/api/")) seen.add(path);
    }
  }
  return Array.from(seen);
}

/** The route node names (as stored, e.g. "/projects/[id]") that the steps' paths fall under. */
export function journeyTouches(steps: unknown, routeNames: string[]): string[] {
  const paths = stepPaths(steps);
  const hits: string[] = [];
  for (const path of paths) {
    const route = routeNames.find((name) => routeCoversPattern(name.replace(/^route:/, ""), path));
    if (route && !hits.includes(route)) hits.push(route);
  }
  return hits;
}
