import type { FileEntry } from "@/services/indexing/clone";
import { getStorage } from "@/lib/storage";

interface BitbucketTreeItem {
  path: string;
  type: "commit_file" | "commit_directory";
  size?: number;
}

interface BitbucketTreeResponse {
  values: BitbucketTreeItem[];
  next?: string;
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

function isIgnoredPath(path: string): boolean {
  const parts = path.split("/");
  return parts.some((p) => IGNORED_DIRS.has(p));
}

async function fetchBitbucketTree(
  workspace: string,
  repo: string,
  branch: string,
  token: string
): Promise<BitbucketTreeItem[]> {
  const items: BitbucketTreeItem[] = [];
  let url: string | undefined =
    `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/src/${branch}/?pagelen=100`;

  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`Bitbucket API error: ${response.status}`);
    }

    const data = (await response.json()) as BitbucketTreeResponse;
    items.push(...data.values);
    url = data.next;
  }

  return items;
}

async function fetchBitbucketFile(
  workspace: string,
  repo: string,
  branch: string,
  filePath: string,
  token: string
): Promise<string> {
  const url = `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/src/${branch}/${filePath}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${filePath}: ${response.status}`);
  }

  return response.text();
}

export async function cloneBitbucketRepository(
  workspace: string,
  repo: string,
  branch: string,
  token: string,
  storagePrefix: string
): Promise<{ fileTree: FileEntry[]; totalFiles: number; totalSize: number }> {
  const storage = getStorage();
  const fileTree: FileEntry[] = [];
  let totalSize = 0;

  const items = await fetchBitbucketTree(workspace, repo, branch, token);

  for (const item of items) {
    if (isIgnoredPath(item.path)) continue;

    if (item.type === "commit_directory") {
      fileTree.push({ path: item.path, type: "dir", size: 0 });
    } else if (item.type === "commit_file" && isIndexableFile(item.path)) {
      const size = item.size ?? 0;
      fileTree.push({ path: item.path, type: "file", size });
      totalSize += size;

      const content = await fetchBitbucketFile(workspace, repo, branch, item.path, token);
      await storage.upload(`${storagePrefix}/${item.path}`, Buffer.from(content), "text/plain");
    }
  }

  return {
    fileTree,
    totalFiles: fileTree.filter((f) => f.type === "file").length,
    totalSize,
  };
}
