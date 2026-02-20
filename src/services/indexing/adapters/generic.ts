import type { ASTResult } from "@/services/indexing/ast-parser";
import type { RouteManifestEntry } from "@/services/indexing/route-extractor";

interface GenericAdapterResult {
  routes: RouteManifestEntry[];
  entryPoints: string[];
}

const ENTRY_FILE_PATTERNS = [
  /^(?:src\/)?index\.(ts|tsx|js|jsx|mjs)$/,
  /^(?:src\/)?main\.(ts|tsx|js|jsx|mjs)$/,
  /^(?:src\/)?app\.(ts|tsx|js|jsx|mjs)$/,
  /^(?:src\/)?server\.(ts|tsx|js|jsx|mjs)$/,
];

const GENERIC_ROUTE_PATTERNS = [
  /(?:fastify|server)\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/g,
  /app\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/g,
];

function isEntryFile(path: string): boolean {
  return ENTRY_FILE_PATTERNS.some((p) => p.test(path));
}

function extractParams(route: string): string[] {
  const params: string[] = [];
  const paramRe = /:(\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = paramRe.exec(route)) !== null) {
    if (match[1]) params.push(match[1]);
  }
  return params;
}

function detectValidation(ast: ASTResult): string | null {
  const hasZod = ast.imports.some((i) => i.source === "zod");
  if (hasZod) return "zod";
  return null;
}

function extractRoutesFromContent(
  content: string,
  filePath: string,
  ast: ASTResult
): RouteManifestEntry[] {
  const routes: RouteManifestEntry[] = [];
  const seen = new Set<string>();

  for (const pattern of GENERIC_ROUTE_PATTERNS) {
    const re = new RegExp(pattern.source, "g");
    let match: RegExpExecArray | null;

    while ((match = re.exec(content)) !== null) {
      const method = match[1]?.toUpperCase() ?? "GET";
      const route = match[2];
      if (!route || !route.startsWith("/")) continue;

      const key = `${method}:${route}`;
      if (seen.has(key)) continue;
      seen.add(key);

      routes.push({
        route,
        method,
        filePath,
        authRequired: false,
        params: extractParams(route),
        middleware: [],
        validation: detectValidation(ast),
        responseSchema: null,
        type: "api",
      });
    }
  }

  return routes;
}

export function extractGenericAppRoutes(
  files: Array<{ path: string; content: string }>,
  astResults: ASTResult[]
): GenericAdapterResult {
  const routes: RouteManifestEntry[] = [];
  const entryPoints: string[] = [];

  const astMap = new Map<string, ASTResult>();
  for (const ast of astResults) {
    astMap.set(ast.filePath, ast);
  }

  for (const file of files) {
    if (isEntryFile(file.path)) {
      entryPoints.push(file.path);
    }

    const ast = astMap.get(file.path);
    if (!ast) continue;

    const hasHttpPatterns = GENERIC_ROUTE_PATTERNS.some((p) =>
      new RegExp(p.source).test(file.content)
    );

    if (hasHttpPatterns) {
      routes.push(...extractRoutesFromContent(file.content, file.path, ast));
    }
  }

  return { routes, entryPoints };
}

export type { GenericAdapterResult };
