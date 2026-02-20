import type { FileEntry } from "@/services/indexing/clone";
import type { ASTResult } from "@/services/indexing/ast-parser";
import type { RouteManifestEntry } from "@/services/indexing/route-extractor";

interface NextJsAdapterResult {
  routes: RouteManifestEntry[];
  apiEndpoints: RouteManifestEntry[];
  layouts: string[];
  middleware: string[];
}

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function isAppRouterFile(path: string): boolean {
  return path.startsWith("app/") || path.startsWith("src/app/");
}

function getAppRouterBase(path: string): string {
  if (path.startsWith("src/app/")) return "src/app";
  return "app";
}

function filePathToRoute(filePath: string, appBase: string): string {
  let route = filePath
    .replace(appBase + "/", "")
    .replace(/\/page\.(ts|tsx|js|jsx)$/, "")
    .replace(/\/route\.(ts|tsx|js|jsx)$/, "");

  if (route === "page" || route.match(/^page\.(ts|tsx|js|jsx)$/)) return "/";

  // Remove route groups (parenthesized segments)
  route = route.replace(/\([^)]+\)\//g, "");

  // Convert dynamic segments
  route = route.replace(/\[\.\.\.(\w+)\]/g, ":$1*"); // catch-all
  route = route.replace(/\[(\w+)\]/g, ":$1"); // dynamic

  return "/" + route;
}

function isPageFile(path: string): boolean {
  return /\/page\.(ts|tsx|js|jsx)$/.test(path) || /^page\.(ts|tsx|js|jsx)$/.test(path);
}

function isRouteFile(path: string): boolean {
  return /\/route\.(ts|tsx|js|jsx)$/.test(path);
}

function isLayoutFile(path: string): boolean {
  return /\/layout\.(ts|tsx|js|jsx)$/.test(path);
}

function isMiddlewareFile(path: string): boolean {
  return (
    path === "middleware.ts" ||
    path === "middleware.js" ||
    path === "src/middleware.ts" ||
    path === "src/middleware.js"
  );
}

function detectAuthFromImports(ast: ASTResult): boolean {
  return ast.imports.some(
    (imp) =>
      imp.source.includes("auth") ||
      imp.source.includes("session") ||
      imp.source.includes("clerk") ||
      imp.source.includes("next-auth")
  );
}

function detectHttpMethods(ast: ASTResult): string[] {
  const methods: string[] = [];
  for (const exp of ast.exports) {
    const upper = exp.toUpperCase();
    if (HTTP_METHODS.includes(upper)) {
      methods.push(upper);
    }
  }
  return methods.length > 0 ? methods : ["GET"];
}

function detectValidation(ast: ASTResult): string | null {
  const zodImport = ast.imports.find((i) => i.source === "zod");
  if (zodImport) return "zod";

  const yupImport = ast.imports.find((i) => i.source === "yup");
  if (yupImport) return "yup";

  return null;
}

function extractDynamicParams(route: string): string[] {
  const params: string[] = [];
  const paramRe = /:(\w+)\*?/g;
  let match: RegExpExecArray | null;
  while ((match = paramRe.exec(route)) !== null) {
    if (match[1]) params.push(match[1]);
  }
  return params;
}

export function extractNextJsRoutes(
  fileTree: FileEntry[],
  astResults: ASTResult[]
): NextJsAdapterResult {
  const routes: RouteManifestEntry[] = [];
  const apiEndpoints: RouteManifestEntry[] = [];
  const layouts: string[] = [];
  const middleware: string[] = [];

  const astMap = new Map<string, ASTResult>();
  for (const ast of astResults) {
    astMap.set(ast.filePath, ast);
  }

  const appRouterFiles = fileTree.filter(
    (f) => f.type === "file" && isAppRouterFile(f.path)
  );

  for (const file of appRouterFiles) {
    const appBase = getAppRouterBase(file.path);
    const ast = astMap.get(file.path);

    if (isPageFile(file.path)) {
      const routePath = filePathToRoute(file.path, appBase);
      const hasAuth = ast ? detectAuthFromImports(ast) : false;

      routes.push({
        route: routePath,
        method: "GET",
        filePath: file.path,
        authRequired: hasAuth,
        params: extractDynamicParams(routePath),
        middleware: [],
        validation: null,
        responseSchema: null,
        type: "page",
      });
    }

    if (isRouteFile(file.path)) {
      const routePath = filePathToRoute(file.path, appBase);
      const hasAuth = ast ? detectAuthFromImports(ast) : false;
      const methods = ast ? detectHttpMethods(ast) : ["GET"];
      const validation = ast ? detectValidation(ast) : null;

      for (const method of methods) {
        apiEndpoints.push({
          route: routePath.startsWith("/api") ? routePath : `/api${routePath}`,
          method,
          filePath: file.path,
          authRequired: hasAuth,
          params: extractDynamicParams(routePath),
          middleware: [],
          validation,
          responseSchema: null,
          type: "api",
        });
      }
    }

    if (isLayoutFile(file.path)) {
      layouts.push(file.path);
    }
  }

  const middlewareFiles = fileTree.filter(
    (f) => f.type === "file" && isMiddlewareFile(f.path)
  );
  for (const mf of middlewareFiles) {
    middleware.push(mf.path);
  }

  return { routes, apiEndpoints, layouts, middleware };
}

export type { NextJsAdapterResult };
