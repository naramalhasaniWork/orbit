import type { FileEntry } from "@/services/indexing/clone";
import type { ASTResult } from "@/services/indexing/ast-parser";
import type { FrameworkDetection } from "@/services/indexing/framework-detector";
import { extractNextJsRoutes } from "@/services/indexing/adapters/nextjs";
import { extractExpressAppRoutes } from "@/services/indexing/adapters/express";
import { extractGenericAppRoutes } from "@/services/indexing/adapters/generic";

interface RouteManifestEntry {
  route: string;
  method: string;
  filePath: string;
  authRequired: boolean;
  params: string[];
  middleware: string[];
  validation: string | null;
  responseSchema: string | null;
  type: "page" | "api";
}

interface RouteManifest {
  routes: RouteManifestEntry[];
  apiEndpoints: RouteManifestEntry[];
  layouts: string[];
  middleware: string[];
}

export function extractRoutes(
  fileTree: FileEntry[],
  files: Array<{ path: string; content: string }>,
  astResults: ASTResult[],
  framework: FrameworkDetection
): RouteManifest {
  const manifest: RouteManifest = {
    routes: [],
    apiEndpoints: [],
    layouts: [],
    middleware: [],
  };

  switch (framework.name) {
    case "nextjs": {
      const result = extractNextJsRoutes(fileTree, astResults);
      manifest.routes = result.routes;
      manifest.apiEndpoints = result.apiEndpoints;
      manifest.layouts = result.layouts;
      manifest.middleware = result.middleware;
      break;
    }
    case "express":
    case "fastify": {
      const result = extractExpressAppRoutes(files, astResults);
      manifest.apiEndpoints = result.routes;
      manifest.middleware = result.middleware;
      break;
    }
    default: {
      const result = extractGenericAppRoutes(files, astResults);
      manifest.apiEndpoints = result.routes;
      break;
    }
  }

  return manifest;
}

export type { RouteManifestEntry, RouteManifest };
