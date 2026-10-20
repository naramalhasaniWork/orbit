/**
 * Safe construction of Git provider API URLs (GitHub, GitLab, Bitbucket)
 * and repo storage keys.
 *
 * Paths, refs and names reach these builders from indexing, webhooks and user
 * input, and the requests carry the project's GitHub token. Without checks,
 * `../` segments or percent-encodings could steer a request to a different
 * API path using that token, or a storage key outside the project's prefix.
 */

const GITHUB_API = "https://api.github.com";

/** GitHub owner/repo names: letters, digits, `-`, `_`, `.` (not `.` or `..`). */
const NAME_RE = /^[A-Za-z0-9_.-]+$/;

/** Encoded `.`, `/` and `\` let traversal survive a later decode. */
const ENCODED_TRAVERSAL_RE = /%2e|%2f|%5c/i;

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/;

export class UnsafeRepoPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeRepoPathError";
  }
}

/**
 * A repo-relative path or ref: no absolute paths, `.`/`..` segments,
 * backslashes, encoded traversal, empty segments or control characters.
 * `allowEmpty` permits "" (the repo root, for directory listings).
 */
export function assertSafeRepoPath(value: string, label = "path", allowEmpty = false): string {
  if (value === "" && allowEmpty) return value;
  if (!value) throw new UnsafeRepoPathError(`Empty ${label}`);
  if (value.startsWith("/")) throw new UnsafeRepoPathError(`Absolute ${label} not allowed: ${value}`);
  if (value.includes("\\")) throw new UnsafeRepoPathError(`Backslash in ${label}: ${value}`);
  if (ENCODED_TRAVERSAL_RE.test(value)) throw new UnsafeRepoPathError(`Encoded separator in ${label}: ${value}`);
  if (CONTROL_CHAR_RE.test(value)) throw new UnsafeRepoPathError(`Control character in ${label}`);
  for (const segment of value.split("/")) {
    if (segment === "" || segment === "." || segment === "..") {
      throw new UnsafeRepoPathError(`Invalid segment in ${label}: ${value}`);
    }
  }
  return value;
}

export function isSafeRepoPath(value: string): boolean {
  try {
    assertSafeRepoPath(value);
    return true;
  } catch {
    return false;
  }
}

export function assertSafeRepoName(value: string, label = "name"): string {
  if (!NAME_RE.test(value) || value === "." || value === "..") {
    throw new UnsafeRepoPathError(`Invalid repository ${label}: ${value}`);
  }
  return value;
}

/** Encode each segment of an already-validated path. */
function encodeSegments(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function repoBase(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(assertSafeRepoName(owner, "owner"))}/${encodeURIComponent(assertSafeRepoName(repo, "repo"))}/`;
}

function assertUnder(url: string, prefix: string): string {
  const pathname = new URL(url).pathname;
  if (!pathname.startsWith(prefix)) {
    throw new UnsafeRepoPathError(`GitHub URL escaped ${prefix}: ${pathname}`);
  }
  return url;
}

/**
 * `https://api.github.com/repos/{owner}/{repo}/{...segments}`. Each segment is
 * one URL path segment (encoded, so a ref like `feature/x` stays one segment).
 */
export function githubRepoApiUrl(
  owner: string,
  repo: string,
  segments: Array<string | number>,
  query?: Record<string, string>
): string {
  const base = repoBase(owner, repo);
  const path = segments.map((s) => {
    const value = String(s);
    if (!value || value === "." || value === "..") {
      throw new UnsafeRepoPathError(`Invalid URL segment: ${value}`);
    }
    return encodeURIComponent(value);
  }).join("/");
  const qs = query ? `?${new URLSearchParams(query).toString()}` : "";
  const url = `${GITHUB_API}${base}${path}${qs}`;
  return assertUnder(url, base);
}

/** `.../repos/{owner}/{repo}` itself (repo metadata). */
export function githubRepoUrl(owner: string, repo: string): string {
  const base = repoBase(owner, repo);
  return assertUnder(`${GITHUB_API}${base.slice(0, -1)}`, base.slice(0, -1));
}

/** Contents API for a repo-relative file or directory ("" = repo root). */
export function githubContentsUrl(owner: string, repo: string, path: string, ref?: string): string {
  assertSafeRepoPath(path, "path", true);
  if (ref !== undefined) assertSafeRepoPath(ref, "ref");
  const prefix = `${repoBase(owner, repo)}contents/`;
  const qs = ref ? `?${new URLSearchParams({ ref }).toString()}` : "";
  const url = `${GITHUB_API}${prefix}${path ? encodeSegments(path) : ""}${qs}`;
  return assertUnder(url, prefix);
}

/** Storage key for a cloned repo file: `repos/{projectId}/{branch}/{path}`. */
export function repoStorageKey(projectId: string, branch: string, filePath?: string): string {
  assertSafeRepoPath(projectId, "project id");
  assertSafeRepoPath(branch, "branch");
  const prefix = `repos/${projectId}/${branch}`;
  if (filePath === undefined) return prefix;
  return `${prefix}/${assertSafeRepoPath(filePath, "path")}`;
}

// ============================================================
// Token-bearing downloads and other providers
// ============================================================

/** Hosts that may receive a GitHub token when following a download_url. */
const GITHUB_DOWNLOAD_HOSTS = new Set(["raw.githubusercontent.com", "api.github.com"]);

/** True when a URL from a GitHub API response may be fetched with the token. */
export function isTrustedGitHubDownloadUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      GITHUB_DOWNLOAD_HOSTS.has(parsed.hostname) &&
      parsed.port === "" &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

const GITLAB_API = "https://gitlab.com";

function gitlabProjectBase(projectPath: string): string {
  assertSafeRepoPath(projectPath, "GitLab project");
  for (const segment of projectPath.split("/")) assertSafeRepoName(segment, "GitLab namespace");
  return `/api/v4/projects/${encodeURIComponent(projectPath)}/repository/`;
}

/** GitLab repository tree listing for a directory ("" = root). */
export function gitlabTreeUrl(projectPath: string, ref: string, dirPath: string): string {
  const base = gitlabProjectBase(projectPath);
  assertSafeRepoPath(ref, "ref");
  assertSafeRepoPath(dirPath, "path", true);
  const qs = new URLSearchParams({ ref, path: dirPath || "/", per_page: "100" });
  return assertUnder(`${GITLAB_API}${base}tree?${qs.toString()}`, `${base}tree`);
}

/** GitLab raw file content. The file path is one encoded segment, per GitLab's API. */
export function gitlabRawFileUrl(projectPath: string, filePath: string, ref: string): string {
  const base = gitlabProjectBase(projectPath);
  assertSafeRepoPath(filePath, "path");
  assertSafeRepoPath(ref, "ref");
  const prefix = `${base}files/`;
  const url = `${GITLAB_API}${prefix}${encodeURIComponent(filePath)}/raw?${new URLSearchParams({ ref }).toString()}`;
  return assertUnder(url, prefix);
}

const BITBUCKET_API = "https://api.bitbucket.org";

function bitbucketSrcPrefix(workspace: string, repo: string): string {
  return `/2.0/repositories/${encodeURIComponent(assertSafeRepoName(workspace, "workspace"))}/${encodeURIComponent(assertSafeRepoName(repo, "repo"))}/src/`;
}

/** Bitbucket `src` endpoint: a directory listing (no filePath) or a file's content. */
export function bitbucketSrcUrl(
  workspace: string, repo: string, ref: string, filePath?: string, query?: Record<string, string>
): string {
  const prefix = bitbucketSrcPrefix(workspace, repo);
  assertSafeRepoPath(ref, "ref");
  const path = filePath === undefined ? "" : encodeSegments(assertSafeRepoPath(filePath, "path"));
  const qs = query ? `?${new URLSearchParams(query).toString()}` : "";
  return assertUnder(`${BITBUCKET_API}${prefix}${encodeURIComponent(ref)}/${path}${qs}`, prefix);
}

/** A Bitbucket pagination `next` link may only continue the same listing on the API host. */
export function assertBitbucketPageUrl(next: string, workspace: string, repo: string): string {
  const parsed = new URL(next);
  if (parsed.protocol !== "https:" || parsed.host !== "api.bitbucket.org") {
    throw new UnsafeRepoPathError(`Unexpected Bitbucket pagination host: ${parsed.host}`);
  }
  return assertUnder(next, bitbucketSrcPrefix(workspace, repo));
}
