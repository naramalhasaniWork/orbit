import { prisma } from "@/lib/db";
import type { ResolvedAction } from "./types";

/**
 * Which System Map route nodes a script exercises, so a code change can
 * find the scripts it may break (see invalidation.ts) without guessing from
 * test names.
 */

/** Same-origin URL patterns a script visits ("/projects/*", ...). */
export function coveredRoutes(actions: ResolvedAction[]): string[] {
  const routes = new Set<string>();
  for (const action of actions) {
    for (const pattern of [action.pre.urlPattern, action.post.urlPattern]) {
      if (pattern.startsWith("/")) routes.add(pattern);
    }
  }
  return Array.from(routes).sort();
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

export async function coveredNodeIds(projectId: string, routes: string[]): Promise<string[]> {
  if (routes.length === 0) return [];
  const nodes = await prisma.systemMapNode.findMany({
    where: { projectId, type: "route" },
    select: { id: true, name: true },
  });
  return nodes
    .filter((node) => {
      const route = node.name.replace(/^route:/, "");
      return routes.some((pattern) => routeCoversPattern(route, pattern));
    })
    .map((node) => node.id);
}
