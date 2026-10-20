const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build",
  ".cache", "coverage", ".turbo", ".vercel",
  "__pycache__", "venv", ".venv",
]);

const INDEXABLE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".rs", ".java", ".vue", ".svelte",
  ".json", ".yaml", ".yml", ".toml", ".graphql", ".gql", ".prisma",
]);

export function isIndexableFile(path: string): boolean {
  const ext = path.substring(path.lastIndexOf("."));
  return INDEXABLE_EXTENSIONS.has(ext);
}

export function isIgnoredDir(name: string): boolean {
  return IGNORED_DIRS.has(name);
}

/** True when any directory segment of a repo-relative path is ignored (node_modules/..., dist/...). */
export function isInIgnoredDir(path: string): boolean {
  const segments = path.split("/");
  return segments.slice(0, -1).some(isIgnoredDir);
}
