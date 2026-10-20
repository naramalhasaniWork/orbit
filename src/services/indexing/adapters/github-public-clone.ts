import type { FileEntry } from "@/services/indexing/clone";
import { getStorage } from "@/lib/storage";
import { isInIgnoredDir, isIndexableFile } from "@/services/indexing/file-filters";
import { describeRateLimit, readRateLimit } from "@/lib/github/public-repo";
import { githubRepoApiUrl, assertSafeRepoPath, isSafeRepoPath } from "@/lib/github/repo-paths";

// Anonymous GitHub API calls are limited to 60/hour per IP, so this path reads the whole tree
// with one recursive request and fetches file bodies from raw.githubusercontent.com, which
// does not count against the API limit.

const FETCH_TIMEOUT_MS = 30_000;
const DOWNLOAD_CONCURRENCY = 8;
export const MAX_PUBLIC_FILES = 5000;
export const MAX_PUBLIC_FILE_BYTES = 1_000_000;

interface TreeItem {
  path: string;
  type: "blob" | "tree" | "commit";
  size?: number;
}

interface TreeResponse {
  tree: TreeItem[];
  truncated?: boolean;
}

export interface PublicClonePlan {
  fileTree: FileEntry[];
  downloads: string[];
  /** Indexable files left out because of the file-count or size limits. */
  skipped: number;
}

/** Decide which files of a recursive tree to index. Pure; the limits keep a pasted monorepo from flooding a worker. */
export function planPublicClone(tree: readonly TreeItem[]): PublicClonePlan {
  const dirs = new Set<string>();
  const files: Array<{ path: string; size: number }> = [];
  let skipped = 0;

  for (const item of tree) {
    if (item.type !== "blob" || !isIndexableFile(item.path) || isInIgnoredDir(item.path)) continue;
    if (!isSafeRepoPath(item.path)) continue;
    const size = item.size ?? 0;
    if (size > MAX_PUBLIC_FILE_BYTES || files.length >= MAX_PUBLIC_FILES) {
      skipped++;
      continue;
    }
    files.push({ path: item.path, size });
    const parts = item.path.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }

  const fileTree: FileEntry[] = [
    ...Array.from(dirs).sort().map((path): FileEntry => ({ path, type: "dir", size: 0 })),
    ...files.map((f): FileEntry => ({ path: f.path, type: "file", size: f.size })),
  ];
  return { fileTree, downloads: files.map((f) => f.path), skipped };
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTree(owner: string, repo: string, branch: string): Promise<TreeResponse> {
  const res = await fetchWithTimeout(
    githubRepoApiUrl(owner, repo, ["git", "trees", assertSafeRepoPath(branch, "branch")], { recursive: "1" }),
    { headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } }
  );

  const limit = readRateLimit(res.headers);
  if (res.status === 429 || (res.status === 403 && limit?.remaining === 0)) {
    throw new Error(describeRateLimit(limit?.resetAt ?? null));
  }
  if (res.status === 404) {
    throw new Error(`${owner}/${repo}@${branch} was not found. It may be private; connect GitHub to index it.`);
  }
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} reading ${owner}/${repo}`);
  return (await res.json()) as TreeResponse;
}

export async function clonePublicGitHubRepository(
  owner: string,
  repo: string,
  branch: string,
  storagePrefix: string
): Promise<{ fileTree: FileEntry[]; totalFiles: number; totalSize: number }> {
  const storage = getStorage();
  const treeResponse = await fetchTree(owner, repo, branch);
  if (treeResponse.truncated) {
    console.warn(`[clone] ${owner}/${repo} tree is truncated by GitHub; indexing the part returned`);
  }

  const plan = planPublicClone(treeResponse.tree);
  if (plan.skipped > 0) {
    console.warn(`[clone] ${owner}/${repo}: skipped ${plan.skipped} files over the size or count limit`);
  }
  console.log(`[clone] Tree read: ${plan.downloads.length} files to download`);

  for (let i = 0; i < plan.downloads.length; i += DOWNLOAD_CONCURRENCY) {
    const batch = plan.downloads.slice(i, i + DOWNLOAD_CONCURRENCY);
    await Promise.all(
      batch.map(async (path) => {
        const encoded = path.split("/").map(encodeURIComponent).join("/");
        const res = await fetchWithTimeout(
          `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${encoded}`
        );
        if (!res.ok) throw new Error(`Failed to download ${path}: ${res.status}`);
        await storage.upload(`${storagePrefix}/${assertSafeRepoPath(path)}`, Buffer.from(await res.text()), "text/plain");
      })
    );
  }

  const files = plan.fileTree.filter((f) => f.type === "file");
  return {
    fileTree: plan.fileTree,
    totalFiles: files.length,
    totalSize: files.reduce((sum, f) => sum + f.size, 0),
  };
}
