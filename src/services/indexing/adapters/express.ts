import type { ASTResult } from "@/services/indexing/ast-parser";
import type { RouteManifestEntry } from "@/services/indexing/route-extractor";

interface ExpressAdapterResult {
  routes: RouteManifestEntry[];
  middleware: string[];
}

// Patterns for Express route definitions
const ROUTE_PATTERN_STANDARD =
  /(?:app|router)\.(get|post|put|patch|delete|all|use)\s*\(\s*['"]([^'"]+)['"]/g;

const ROUTE_PATTERN_CHAINED =
  /\.route\s*\(\s*['"]([^'"]+)['"]\s*\)\.(get|post|put|patch|delete)/g;

// Patterns for middleware registration
const MIDDLEWARE_NAMED_PATTERN = /app\.use\s*\(\s*(\w+)/g;

function extractExpressRoutes(
  content: string,
  filePath: string,
  ast: ASTResult
): RouteManifestEntry[] {
  const routes: RouteManifestEntry[] = [];
  const seen = new Set<string>();

  const standardRe = new RegExp(ROUTE_PATTERN_STANDARD.source, "g");
  let match: RegExpExecArray | null;

  while ((match = standardRe.exec(content)) !== null) {
    const method = match[1]?.toUpperCase();
    const route = match[2];
    if (!method || !route || method === "USE") continue;

    const key = `${method}:${route}`;
    if (seen.has(key)) continue;
    seen.add(key);

    routes.push({
      route,
      method,
      filePath,
      authRequired: detectAuthMiddleware(content),
      params: extractExpressParams(route),
      middleware: extractRouteMiddleware(content),
      validation: detectValidation(ast),
      responseSchema: null,
      type: "api",
    });
  }

  const chainedRe = new RegExp(ROUTE_PATTERN_CHAINED.source, "g");
  while ((match = chainedRe.exec(content)) !== null) {
    const route = match[1];
    const method = match[2]?.toUpperCase();
    if (!route || !method) continue;

    const key = `${method}:${route}`;
    if (seen.has(key)) continue;
    seen.add(key);

    routes.push({
      route,
      method,
      filePath,
      authRequired: detectAuthMiddleware(content),
      params: extractExpressParams(route),
      middleware: [],
      validation: detectValidation(ast),
      responseSchema: null,
      type: "api",
    });
  }

  return routes;
}

function extractExpressParams(route: string): string[] {
  const params: string[] = [];
  const paramRe = /:(\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = paramRe.exec(route)) !== null) {
    if (match[1]) params.push(match[1]);
  }
  return params;
}

function detectAuthMiddleware(content: string): boolean {
  const authPatterns = [
    /auth(?:enticate|orize|Middleware|Guard|Check)/i,
    /passport\.authenticate/,
    /requireAuth/,
    /isAuthenticated/,
    /verifyToken/,
    /protect/,
  ];
  return authPatterns.some((p) => p.test(content));
}

function extractRouteMiddleware(content: string): string[] {
  const middlewareNames: string[] = [];
  const re = new RegExp(MIDDLEWARE_NAMED_PATTERN.source, "g");
  let match: RegExpExecArray | null;

  while ((match = re.exec(content)) !== null) {
    if (match[1]) middlewareNames.push(match[1]);
  }

  return middlewareNames;
}

function detectValidation(ast: ASTResult): string | null {
  const hasZod = ast.imports.some((i) => i.source === "zod");
  if (hasZod) return "zod";

  const hasJoi = ast.imports.some((i) => i.source === "joi");
  if (hasJoi) return "joi";

  const hasYup = ast.imports.some((i) => i.source === "yup");
  if (hasYup) return "yup";

  return null;
}

export function extractExpressAppRoutes(
  files: Array<{ path: string; content: string }>,
  astResults: ASTResult[]
): ExpressAdapterResult {
  const routes: RouteManifestEntry[] = [];
  const middleware: string[] = [];

  const astMap = new Map<string, ASTResult>();
  for (const ast of astResults) {
    astMap.set(ast.filePath, ast);
  }

  for (const file of files) {
    const ast = astMap.get(file.path);
    if (!ast) continue;

    const isExpressFile = ast.imports.some(
      (imp) =>
        imp.source === "express" ||
        imp.specifiers.includes("Router") ||
        imp.specifiers.includes("router")
    );

    const hasRoutePatterns =
      file.content.includes("app.get") ||
      file.content.includes("app.post") ||
      file.content.includes("router.get") ||
      file.content.includes("router.post");

    if (isExpressFile || hasRoutePatterns) {
      routes.push(...extractExpressRoutes(file.content, file.path, ast));
      middleware.push(...extractRouteMiddleware(file.content));
    }
  }

  return { routes, middleware: Array.from(new Set(middleware)) };
}

export type { ExpressAdapterResult };
