/**
 * Safe construction of GitHub API URLs and repo storage keys.
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
