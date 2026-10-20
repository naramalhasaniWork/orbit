import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { resolveGitHubToken } from "@/lib/github/token";
import { isIgnoredDir, isIndexableFile } from "@/services/indexing/file-filters";
import { clonePublicGitHubRepository } from "@/services/indexing/adapters/github-public-clone";
import { cloneGitLabRepository } from "@/services/indexing/adapters/gitlab-clone";
import { cloneBitbucketRepository } from "@/services/indexing/adapters/bitbucket-clone";
import {
  githubContentsUrl,
  repoStorageKey,
  assertSafeRepoPath,
  isSafeRepoPath,
} from "@/lib/github/repo-paths";

interface CloneResult {
  localPath: string;
  fileTree: FileEntry[];
  totalFiles: number;
  totalSize: number;
}

interface FileEntry {
  path: string;
  type: "file" | "dir";
  size: number;
}

interface GitHubContentItem {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  download_url: string | null;
}

type RepoProvider = "github" | "gitlab" | "bitbucket";

/**
 * Detect provider from repo URL.
 */
export function detectProvider(repoUrl: string): RepoProvider {
  if (repoUrl.includes("gitlab.com") || repoUrl.includes("gitlab")) return "gitlab";
  if (repoUrl.includes("bitbucket.org") || repoUrl.includes("bitbucket")) return "bitbucket";
  return "github";
}

// ============================================================
// GitHub clone
// ============================================================

/** Prefer a GitHub App installation token (works for org repos with restricted OAuth). */
async function getGitHubAccessToken(projectId: string): Promise<string | null> {
  const resolved = await resolveGitHubToken(projectId);
  if (resolved) {
    console.log(`[clone] Using ${resolved.source} token for project ${projectId}`);
    return resolved.token;
  }
  return null;
}

// A single hung request without a timeout stalls the whole index job
// forever — the "indexing stuck on starting" failure mode.
const FETCH_TIMEOUT_MS = 30_000;
const DOWNLOAD_CONCURRENCY = 8;

async function fetchWithTimeout(
  url: string,
  init: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDirectoryContents(
  owner: string,
  repo: string,
  path: string,
  branch: string,
  token: string
): Promise<GitHubContentItem[]> {
  const url = githubContentsUrl(owner, repo, path, branch);
  const response = await fetchWithTimeout(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} for path ${path}`);
  }

  return response.json() as Promise<GitHubContentItem[]>;
}

async function fetchFileContent(
  downloadUrl: string,
  token: string
): Promise<string> {
  const response = await fetchWithTimeout(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }

  return response.text();
}

async function cloneGitHub(
  projectId: string,
  owner: string,
  repo: string,
  branch: string
): Promise<CloneResult> {
  const resolvedToken = await getGitHubAccessToken(projectId);
  const localPath = repoStorageKey(projectId, branch);

  // No token anywhere (a repo added by pasting its public URL): read it anonymously.
  if (!resolvedToken) {
    console.log(`[clone] No GitHub token for project ${projectId}; cloning ${owner}/${repo} anonymously`);
    const result = await clonePublicGitHubRepository(owner, repo, branch, localPath);
    return { localPath, ...result };
  }
  const token: string = resolvedToken;

  const storage = getStorage();
  const fileTree: FileEntry[] = [];
  const downloads: Array<{ path: string; url: string }> = [];
  let totalSize = 0;

  // Phase 1: crawl the tree (directory listings only — no file bodies)
  async function crawlDirectory(dirPath: string): Promise<void> {
    const items = await fetchDirectoryContents(owner, repo, dirPath, branch, token);

    for (const item of items) {
      if (item.type === "dir") {
        if (isIgnoredDir(item.name)) continue;
        fileTree.push({ path: item.path, type: "dir", size: 0 });
        await crawlDirectory(item.path);
      } else if (item.type === "file" && isIndexableFile(item.path) && isSafeRepoPath(item.path)) {
        fileTree.push({ path: item.path, type: "file", size: item.size });
        totalSize += item.size;
        if (item.download_url) {
          downloads.push({ path: item.path, url: item.download_url });
        }
      }
    }
  }

  await crawlDirectory("");
  console.log(`[clone] Tree crawled: ${downloads.length} files to download`);

  // Phase 2: download file bodies in bounded parallel batches — the old
  // strictly-sequential loop took ~forever on large repos and looked
  // like a hung "starting" phase in the UI
  for (let i = 0; i < downloads.length; i += DOWNLOAD_CONCURRENCY) {
    const batch = downloads.slice(i, i + DOWNLOAD_CONCURRENCY);
    await Promise.all(
      batch.map(async ({ path, url }) => {
        const content = await fetchFileContent(url, token);
        await storage.upload(`${localPath}/${assertSafeRepoPath(path)}`, Buffer.from(content), "text/plain");
      })
    );
    if ((i / DOWNLOAD_CONCURRENCY) % 10 === 0) {
      console.log(`[clone] Downloaded ${Math.min(i + DOWNLOAD_CONCURRENCY, downloads.length)}/${downloads.length} files`);
    }
  }

  return {
    localPath,
    fileTree,
    totalFiles: fileTree.filter((f) => f.type === "file").length,
    totalSize,
  };
}

// ============================================================
// Unified clone entry point
// ============================================================

export async function cloneRepository(
  projectId: string,
  owner: string,
  repo: string,
  branch: string
): Promise<CloneResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { repoUrl: true, repoProvider: true },
  });

  const provider = (project?.repoProvider as RepoProvider) ??
    detectProvider(project?.repoUrl ?? "");
  const localPath = repoStorageKey(projectId, branch);

  switch (provider) {
    case "gitlab": {
      const token = await getGitLabAccessToken(projectId);
      const projectPath = `${owner}/${repo}`;
      const result = await cloneGitLabRepository(projectPath, branch, token, localPath);
      return { localPath, ...result };
    }
    case "bitbucket": {
      const token = await getBitbucketAccessToken(projectId);
      const result = await cloneBitbucketRepository(owner, repo, branch, token, localPath);
      return { localPath, ...result };
    }
    default:
      return cloneGitHub(projectId, owner, repo, branch);
  }
}

// ============================================================
// Provider-specific token retrieval
// ============================================================

async function getGitLabAccessToken(projectId: string): Promise<string> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      workspace: {
        include: {
          members: { include: { user: true }, where: { role: "admin" }, take: 1 },
        },
      },
    },
  });

  const admin = project.workspace.members[0]?.user;
  const settings = (admin?.settings ?? {}) as Record<string, unknown>;
  const token = settings.gitlabAccessToken as string | undefined;

  if (!token) {
    throw new Error("No GitLab access token found for workspace admin");
  }

  return token;
}

async function getBitbucketAccessToken(projectId: string): Promise<string> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      workspace: {
        include: {
          members: { include: { user: true }, where: { role: "admin" }, take: 1 },
        },
      },
    },
  });

  const admin = project.workspace.members[0]?.user;
  const settings = (admin?.settings ?? {}) as Record<string, unknown>;
  const token = settings.bitbucketAccessToken as string | undefined;

  if (!token) {
    throw new Error("No Bitbucket access token found for workspace admin");
  }

  return token;
}

export async function fetchFileFromRepo(
  projectId: string,
  owner: string,
  repo: string,
  branch: string,
  filePath: string
): Promise<string> {
  const token = await getGitHubAccessToken(projectId);
  const url = githubContentsUrl(owner, repo, filePath, branch);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3.raw",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${filePath}: ${response.status}`);
  }

  return response.text();
}

export type { CloneResult, FileEntry, RepoProvider };
