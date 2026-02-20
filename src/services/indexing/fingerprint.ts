import type { FileEntry } from "@/services/indexing/clone";

interface FingerprintResult {
  languages: LanguageInfo[];
  primaryLanguage: string;
  packageManager: string | null;
  manifestFiles: string[];
  totalFiles: number;
  directoryStructure: string[];
  hasTypeScript: boolean;
  hasMonorepo: boolean;
  monorepoTool: string | null;
}

interface LanguageInfo {
  name: string;
  fileCount: number;
  percentage: number;
}

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".rb": "ruby",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".vue": "vue",
  ".svelte": "svelte",
};

const MANIFEST_FILES = new Set([
  "package.json",
  "pyproject.toml",
  "Pipfile",
  "requirements.txt",
  "go.mod",
  "Cargo.toml",
  "Gemfile",
  "build.gradle",
  "pom.xml",
  "composer.json",
]);

const PACKAGE_MANAGERS: Record<string, string> = {
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
  "package-lock.json": "npm",
  "bun.lockb": "bun",
  "Pipfile.lock": "pipenv",
  "poetry.lock": "poetry",
  "go.sum": "go",
  "Cargo.lock": "cargo",
  "Gemfile.lock": "bundler",
};

const MONOREPO_INDICATORS: Record<string, string> = {
  "turbo.json": "turborepo",
  "nx.json": "nx",
  "lerna.json": "lerna",
  "pnpm-workspace.yaml": "pnpm-workspaces",
};

function getFileExtension(path: string): string {
  const lastDot = path.lastIndexOf(".");
  return lastDot >= 0 ? path.substring(lastDot) : "";
}

function getFileName(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
}

function getTopLevelDirs(fileTree: FileEntry[]): string[] {
  const dirs = new Set<string>();
  for (const entry of fileTree) {
    if (entry.type === "dir") {
      const topLevel = entry.path.split("/")[0];
      if (topLevel) dirs.add(topLevel);
    }
  }
  return Array.from(dirs);
}

export function fingerprint(fileTree: FileEntry[]): FingerprintResult {
  const files = fileTree.filter((f) => f.type === "file");
  const languageCounts = new Map<string, number>();
  const manifestFiles: string[] = [];
  let packageManager: string | null = null;
  let hasTypeScript = false;
  let monorepoTool: string | null = null;

  for (const file of files) {
    const fileName = getFileName(file.path);
    const ext = getFileExtension(file.path);

    // Count language
    const language = EXTENSION_TO_LANGUAGE[ext];
    if (language) {
      languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1);
    }

    // Check TypeScript
    if (ext === ".ts" || ext === ".tsx") {
      hasTypeScript = true;
    }

    // Check manifest files
    if (MANIFEST_FILES.has(fileName)) {
      manifestFiles.push(file.path);
    }

    // Detect package manager
    if (PACKAGE_MANAGERS[fileName]) {
      packageManager = PACKAGE_MANAGERS[fileName];
    }

    // Detect monorepo
    if (MONOREPO_INDICATORS[fileName]) {
      monorepoTool = MONOREPO_INDICATORS[fileName];
    }
  }

  // Build sorted language list
  const totalCodeFiles = Array.from(languageCounts.values()).reduce(
    (sum, count) => sum + count,
    0
  );

  const languages: LanguageInfo[] = Array.from(languageCounts.entries())
    .map(([name, fileCount]) => ({
      name,
      fileCount,
      percentage:
        totalCodeFiles > 0
          ? Math.round((fileCount / totalCodeFiles) * 100)
          : 0,
    }))
    .sort((a, b) => b.fileCount - a.fileCount);

  const primaryLanguage = languages[0]?.name ?? "unknown";

  return {
    languages,
    primaryLanguage,
    packageManager,
    manifestFiles,
    totalFiles: files.length,
    directoryStructure: getTopLevelDirs(fileTree),
    hasTypeScript,
    hasMonorepo: monorepoTool !== null,
    monorepoTool,
  };
}

export type { FingerprintResult, LanguageInfo };
