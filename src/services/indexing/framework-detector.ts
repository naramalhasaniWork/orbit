import type { FileEntry } from "@/services/indexing/clone";
import type { FingerprintResult } from "@/services/indexing/fingerprint";

interface FrameworkDetection {
  name: string;
  version: string;
  router: string;
  language: string;
  features: string[];
  confidence: number;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

type FrameworkDetector = (
  fileTree: FileEntry[],
  packageJson: PackageJson | null,
  fingerprint: FingerprintResult
) => FrameworkDetection | null;

function hasFile(fileTree: FileEntry[], name: string): boolean {
  return fileTree.some((f) => f.path === name || f.path.endsWith(`/${name}`));
}

function hasDir(fileTree: FileEntry[], name: string): boolean {
  return fileTree.some(
    (f) =>
      f.type === "dir" && (f.path === name || f.path.endsWith(`/${name}`))
  );
}

function getDependencyVersion(
  pkg: PackageJson | null,
  name: string
): string | null {
  return pkg?.dependencies?.[name] ?? pkg?.devDependencies?.[name] ?? null;
}

function hasDependency(pkg: PackageJson | null, name: string): boolean {
  return getDependencyVersion(pkg, name) !== null;
}

const detectNextJs: FrameworkDetector = (fileTree, pkg, fp) => {
  const hasNextConfig =
    hasFile(fileTree, "next.config.js") ||
    hasFile(fileTree, "next.config.ts") ||
    hasFile(fileTree, "next.config.mjs");
  const hasNextDep = hasDependency(pkg, "next");

  if (!hasNextConfig && !hasNextDep) return null;

  const hasAppDir =
    hasDir(fileTree, "app") || hasDir(fileTree, "src/app");
  const hasPagesDir =
    hasDir(fileTree, "pages") || hasDir(fileTree, "src/pages");
  const router = hasAppDir ? "app-router" : hasPagesDir ? "pages-router" : "unknown";

  const features: string[] = [];
  if (hasDependency(pkg, "next-auth") || hasDependency(pkg, "@auth/nextjs"))
    features.push("next-auth");
  if (hasDependency(pkg, "@clerk/nextjs")) features.push("clerk");
  if (hasDependency(pkg, "prisma") || hasDependency(pkg, "@prisma/client"))
    features.push("prisma");
  if (hasDependency(pkg, "drizzle-orm")) features.push("drizzle");
  if (hasDependency(pkg, "zod")) features.push("zod-validation");
  if (hasDependency(pkg, "@trpc/server")) features.push("trpc");
  if (hasDependency(pkg, "tailwindcss")) features.push("tailwind");
  if (fp.hasTypeScript) features.push("typescript");

  const version = getDependencyVersion(pkg, "next") ?? "unknown";

  return {
    name: "nextjs",
    version,
    router,
    language: fp.hasTypeScript ? "typescript" : "javascript",
    features,
    confidence: hasNextConfig && hasNextDep ? 1.0 : 0.8,
  };
};

const detectExpress: FrameworkDetector = (fileTree, pkg, fp) => {
  if (!hasDependency(pkg, "express")) return null;

  const features: string[] = [];
  if (hasDependency(pkg, "passport")) features.push("passport");
  if (hasDependency(pkg, "cors")) features.push("cors");
  if (hasDependency(pkg, "helmet")) features.push("helmet");
  if (hasDependency(pkg, "prisma") || hasDependency(pkg, "@prisma/client"))
    features.push("prisma");
  if (hasDependency(pkg, "mongoose")) features.push("mongoose");
  if (hasDependency(pkg, "zod")) features.push("zod-validation");
  if (fp.hasTypeScript) features.push("typescript");

  const hasFastify = hasDependency(pkg, "fastify");
  const version = getDependencyVersion(pkg, "express") ?? "unknown";

  return {
    name: hasFastify ? "fastify" : "express",
    version,
    router: "express-router",
    language: fp.hasTypeScript ? "typescript" : "javascript",
    features,
    confidence: 0.9,
  };
};

const detectReact: FrameworkDetector = (_fileTree, pkg, fp) => {
  if (!hasDependency(pkg, "react")) return null;
  // Skip if Next.js — that takes priority
  if (hasDependency(pkg, "next")) return null;

  const features: string[] = [];
  const isVite = hasDependency(pkg, "vite");
  const isCRA = hasDependency(pkg, "react-scripts");

  if (hasDependency(pkg, "react-router-dom")) features.push("react-router");
  if (hasDependency(pkg, "@tanstack/react-query")) features.push("react-query");
  if (hasDependency(pkg, "zustand")) features.push("zustand");
  if (hasDependency(pkg, "redux") || hasDependency(pkg, "@reduxjs/toolkit"))
    features.push("redux");
  if (fp.hasTypeScript) features.push("typescript");

  const version = getDependencyVersion(pkg, "react") ?? "unknown";

  return {
    name: "react",
    version,
    router: hasDependency(pkg, "react-router-dom")
      ? "react-router"
      : "none",
    language: fp.hasTypeScript ? "typescript" : "javascript",
    features,
    confidence: isVite || isCRA ? 0.9 : 0.7,
  };
};

// ============================================================
// Django detector
// ============================================================

const detectDjango: FrameworkDetector = (fileTree, _pkg, fp) => {
  const hasManagePy = hasFile(fileTree, "manage.py");
  const hasSettings = hasFile(fileTree, "settings.py");
  const hasUrls = hasFile(fileTree, "urls.py");

  if (!hasManagePy && !hasSettings && !hasUrls) return null;

  const features: string[] = [];
  if (hasFile(fileTree, "requirements.txt")) features.push("pip");
  if (hasDir(fileTree, "templates")) features.push("templates");
  if (hasDir(fileTree, "static")) features.push("static-files");
  if (fp.hasTypeScript) features.push("typescript");

  const signals = [hasManagePy, hasSettings, hasUrls].filter(Boolean).length;

  return {
    name: "django",
    version: "unknown",
    router: "django-urls",
    language: "python",
    features,
    confidence: signals >= 2 ? 0.9 : 0.7,
  };
};

// ============================================================
// FastAPI detector
// ============================================================

const detectFastAPI: FrameworkDetector = (fileTree, _pkg, _fp) => {
  const hasRequirements = hasFile(fileTree, "requirements.txt");
  const hasPyproject = hasFile(fileTree, "pyproject.toml");

  // Look for FastAPI patterns in file tree
  const pyFiles = fileTree.filter((f) => f.type === "file" && f.path.endsWith(".py"));
  if (pyFiles.length === 0) return null;

  // Heuristic: if no requirements or pyproject, less confident
  if (!hasRequirements && !hasPyproject) return null;

  // Look for main.py or app.py (common FastAPI entry points)
  const hasMainPy = hasFile(fileTree, "main.py") || hasFile(fileTree, "app.py");
  if (!hasMainPy) return null;

  const features: string[] = [];
  if (hasFile(fileTree, "alembic.ini")) features.push("alembic");
  if (hasDir(fileTree, "routers") || hasDir(fileTree, "routes")) features.push("modular-routes");

  return {
    name: "fastapi",
    version: "unknown",
    router: "fastapi-router",
    language: "python",
    features,
    confidence: 0.7,
  };
};

// ============================================================
// Rails detector
// ============================================================

const detectRails: FrameworkDetector = (fileTree, _pkg, _fp) => {
  const hasGemfile = hasFile(fileTree, "Gemfile");
  const hasRoutesRb = hasFile(fileTree, "config/routes.rb");
  const hasAppControllers = hasDir(fileTree, "app/controllers");

  if (!hasGemfile && !hasRoutesRb) return null;

  const features: string[] = [];
  if (hasDir(fileTree, "app/views")) features.push("views");
  if (hasDir(fileTree, "app/models")) features.push("active-record");
  if (hasDir(fileTree, "app/assets") || hasDir(fileTree, "app/javascript"))
    features.push("asset-pipeline");
  if (hasFile(fileTree, "config/database.yml")) features.push("database");

  const signals = [hasGemfile, hasRoutesRb, hasAppControllers].filter(Boolean).length;

  return {
    name: "rails",
    version: "unknown",
    router: "rails-router",
    language: "ruby",
    features,
    confidence: signals >= 2 ? 0.9 : 0.6,
  };
};

// ============================================================
// GraphQL detector
// ============================================================

const detectGraphQL: FrameworkDetector = (fileTree, pkg, fp) => {
  const hasGraphqlFiles = fileTree.some(
    (f) =>
      f.type === "file" &&
      (f.path.endsWith(".graphql") || f.path.endsWith(".gql"))
  );
  const hasApollo = hasDependency(pkg, "@apollo/server") || hasDependency(pkg, "apollo-server");
  const hasUrql = hasDependency(pkg, "urql") || hasDependency(pkg, "@urql/core");
  const hasGraphqlDep = hasDependency(pkg, "graphql");

  if (!hasGraphqlFiles && !hasApollo && !hasUrql && !hasGraphqlDep) return null;

  const features: string[] = [];
  if (hasApollo) features.push("apollo");
  if (hasUrql) features.push("urql");
  if (hasDependency(pkg, "type-graphql")) features.push("type-graphql");
  if (hasDependency(pkg, "nexus")) features.push("nexus");
  if (fp.hasTypeScript) features.push("typescript");

  return {
    name: "graphql",
    version: getDependencyVersion(pkg, "graphql") ?? "unknown",
    router: "graphql-schema",
    language: fp.hasTypeScript ? "typescript" : fp.primaryLanguage,
    features,
    confidence: hasGraphqlFiles && hasGraphqlDep ? 0.9 : 0.7,
  };
};

// ============================================================
// tRPC detector
// ============================================================

const detectTrpc: FrameworkDetector = (_fileTree, pkg, fp) => {
  const hasTrpcServer = hasDependency(pkg, "@trpc/server");
  const hasTrpcClient = hasDependency(pkg, "@trpc/client");

  if (!hasTrpcServer && !hasTrpcClient) return null;

  const features: string[] = [];
  if (hasTrpcServer) features.push("server");
  if (hasTrpcClient) features.push("client");
  if (hasDependency(pkg, "@trpc/react-query")) features.push("react-query");
  if (hasDependency(pkg, "zod")) features.push("zod-validation");
  if (fp.hasTypeScript) features.push("typescript");

  return {
    name: "trpc",
    version: getDependencyVersion(pkg, "@trpc/server") ?? getDependencyVersion(pkg, "@trpc/client") ?? "unknown",
    router: "trpc-router",
    language: fp.hasTypeScript ? "typescript" : "javascript",
    features,
    confidence: hasTrpcServer ? 0.9 : 0.7,
  };
};

const detectors: FrameworkDetector[] = [
  detectNextJs,
  detectExpress,
  detectReact,
  detectDjango,
  detectFastAPI,
  detectRails,
  detectGraphQL,
  detectTrpc,
];

export function detectFramework(
  fileTree: FileEntry[],
  packageJsonContent: string | null,
  fp: FingerprintResult
): FrameworkDetection {
  const packageJson: PackageJson | null = packageJsonContent
    ? (JSON.parse(packageJsonContent) as PackageJson)
    : null;

  let bestMatch: FrameworkDetection | null = null;

  for (const detect of detectors) {
    const result = detect(fileTree, packageJson, fp);
    if (result && (!bestMatch || result.confidence > bestMatch.confidence)) {
      bestMatch = result;
    }
  }

  if (bestMatch) return bestMatch;

  // Fallback generic detection
  return {
    name: "generic",
    version: "unknown",
    router: "unknown",
    language: fp.primaryLanguage,
    features: fp.hasTypeScript ? ["typescript"] : [],
    confidence: 0.3,
  };
}

export type { FrameworkDetection, PackageJson };
