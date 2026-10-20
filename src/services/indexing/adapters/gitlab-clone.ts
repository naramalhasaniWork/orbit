import type { FileEntry } from "@/services/indexing/clone";
import { getStorage } from "@/lib/storage";
import {
  assertSafeRepoPath,
  isSafeRepoPath,
  gitlabTreeUrl,
  gitlabRawFileUrl,
} from "@/lib/github/repo-paths";

interface GitLabContentItem {
  name: string;
  path: string;
  type: "blob" | "tree";
  size?: number;
}

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

function isIndexableFile(path: string): boolean {
  const ext = path.substring(path.lastIndexOf("."));
  return INDEXABLE_EXTENSIONS.has(ext);
}

async function fetchGitLabTree(
  projectPath: string,
  branch: string,
  token: string,
  dirPath: string
): Promise<GitLabContentItem[]> {
  const url = gitlabTreeUrl(projectPath, branch, dirPath);

  const response = await fetch(url, {
    headers: { "PRIVATE-TOKEN": token },
  });

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.status} for path ${dirPath}`);
  }

  return response.json() as Promise<GitLabContentItem[]>;
}

async function fetchGitLabFile(
  projectPath: string,
  branch: string,
  filePath: string,
  token: string
): Promise<string> {
  const url = gitlabRawFileUrl(projectPath, filePath, branch);

  const response = await fetch(url, {
    headers: { "PRIVATE-TOKEN": token },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${filePath}: ${response.status}`);
  }

  return response.text();
}

export async function cloneGitLabRepository(
  projectPath: string,
  branch: string,
  token: string,
  storagePrefix: string
): Promise<{ fileTree: FileEntry[]; totalFiles: number; totalSize: number }> {
  const storage = getStorage();
  const fileTree: FileEntry[] = [];
  let totalSize = 0;

  async function crawl(dirPath: string): Promise<void> {
    const items = await fetchGitLabTree(projectPath, branch, token, dirPath);

    for (const item of items) {
      if (item.type === "tree") {
        if (IGNORED_DIRS.has(item.name)) continue;
        fileTree.push({ path: item.path, type: "dir", size: 0 });
        await crawl(item.path);
      } else if (item.type === "blob" && isIndexableFile(item.path) && isSafeRepoPath(item.path)) {
        const size = item.size ?? 0;
        fileTree.push({ path: item.path, type: "file", size });
        totalSize += size;

        const content = await fetchGitLabFile(projectPath, branch, item.path, token);
        await storage.upload(`${storagePrefix}/${assertSafeRepoPath(item.path)}`, Buffer.from(content), "text/plain");
      }
    }
  }

  await crawl("");

  return {
    fileTree,
    totalFiles: fileTree.filter((f) => f.type === "file").length,
    totalSize,
  };
}
