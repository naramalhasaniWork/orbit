import { prisma } from "@/lib/db";
import type { ResolvedAction } from "./types";
import { routeCoversPattern } from "./url-pattern";

export { routeCoversPattern };

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
