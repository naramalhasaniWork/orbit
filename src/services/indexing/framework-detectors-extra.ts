/**
 * Additional framework detectors: Django, FastAPI, Rails, GraphQL, tRPC.
 */

import type { FileEntry } from "@/services/indexing/clone";
import type { FingerprintResult } from "@/services/indexing/fingerprint";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

interface FrameworkDetection {
  name: string;
  version: string;
  router: string;
  language: string;
  features: string[];
  confidence: number;
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
    (f) => f.type === "dir" && (f.path === name || f.path.endsWith(`/${name}`))
  );
}

function getDependencyVersion(pkg: PackageJson | null, name: string): string | null {
  return pkg?.dependencies?.[name] ?? pkg?.devDependencies?.[name] ?? null;
}

function hasDependency(pkg: PackageJson | null, name: string): boolean {
  return getDependencyVersion(pkg, name) !== null;
}

export const detectDjango: FrameworkDetector = (fileTree, _pkg, _fp) => {
  const hasManagePy = hasFile(fileTree, "manage.py");
  const hasSettings = hasFile(fileTree, "settings.py");
  const hasUrls = hasFile(fileTree, "urls.py");
  if (!hasManagePy && !hasSettings && !hasUrls) return null;

  const features: string[] = [];
  if (hasFile(fileTree, "requirements.txt")) features.push("pip");
  if (hasDir(fileTree, "templates")) features.push("templates");
  if (hasDir(fileTree, "static")) features.push("static-files");

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

export const detectFastAPI: FrameworkDetector = (fileTree, _pkg, _fp) => {
  const hasRequirements = hasFile(fileTree, "requirements.txt");
  const hasPyproject = hasFile(fileTree, "pyproject.toml");
  const pyFiles = fileTree.filter((f) => f.type === "file" && f.path.endsWith(".py"));
  if (pyFiles.length === 0) return null;
  if (!hasRequirements && !hasPyproject) return null;

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

export const detectRails: FrameworkDetector = (fileTree, _pkg, _fp) => {
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

export const detectGraphQL: FrameworkDetector = (fileTree, pkg, fp) => {
  const hasGraphqlFiles = fileTree.some(
    (f) => f.type === "file" && (f.path.endsWith(".graphql") || f.path.endsWith(".gql"))
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

export const detectTrpc: FrameworkDetector = (_fileTree, pkg, fp) => {
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
