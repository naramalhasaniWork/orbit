import { describe, it, expect, vi, beforeEach } from "vitest";

const upload = vi.fn();
vi.mock("@/lib/storage", () => ({ getStorage: () => ({ upload }) }));
vi.mock("@/lib/db", () => ({ prisma: { project: { findUnique: vi.fn() } } }));
vi.mock("@/lib/github/token", () => ({ resolveGitHubToken: vi.fn() }));

import { prisma } from "@/lib/db";
import { resolveGitHubToken } from "@/lib/github/token";
import { cloneRepository } from "@/services/indexing/clone";
import { cloneBitbucketRepository } from "@/services/indexing/adapters/bitbucket-clone";
import { cloneGitLabRepository } from "@/services/indexing/adapters/gitlab-clone";
import {
  isTrustedGitHubDownloadUrl,
  gitlabTreeUrl,
  gitlabRawFileUrl,
  bitbucketSrcUrl,
  assertBitbucketPageUrl,
  UnsafeRepoPathError,
} from "@/lib/github/repo-paths";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

const authHeaderFor = (url: string) =>
  fetchMock.mock.calls
    .filter((c) => String(c[0]) === url)
    .map((c) => (c[1]?.headers as Record<string, string> | undefined)?.Authorization);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isTrustedGitHubDownloadUrl", () => {
  it.each([
    ["https://raw.githubusercontent.com/acme/app/main/a.ts", true],
    ["https://api.github.com/repos/acme/app/contents/a.ts", true],
    ["http://raw.githubusercontent.com/acme/app/main/a.ts", false],
    ["https://raw.githubusercontent.com.evil.io/a.ts", false],
    ["https://evil.io/a.ts", false],
    ["https://user:pw@raw.githubusercontent.com/a.ts", false],
    ["https://raw.githubusercontent.com:8443/a.ts", false],
    ["not a url", false],
  ])("%s -> %s", (url, ok) => {
    expect(isTrustedGitHubDownloadUrl(url)).toBe(ok);
  });
});

describe("GitHub clone download_url pinning", () => {
  it("never sends the token to a non-GitHub download host and skips that file", async () => {
    (prisma.project.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ repoUrl: "https://github.com/acme/app", repoProvider: "github" });
    (resolveGitHubToken as ReturnType<typeof vi.fn>).mockResolvedValue({ token: "ghs_secret", source: "installation" });
    const good = "https://raw.githubusercontent.com/acme/app/main/src/a.ts";
    const evil = "https://collector.evil.io/steal";
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/contents/")) {
        return json([
          { name: "a.ts", path: "src/a.ts", type: "file", size: 1, download_url: good },
          { name: "b.ts", path: "src/b.ts", type: "file", size: 1, download_url: evil },
        ]);
      }
      return new Response("export const a = 1;", { status: 200 });
    });

    await cloneRepository("p1", "acme", "app", "main");

    expect(fetchMock.mock.calls.some((c) => String(c[0]) === evil)).toBe(false);
    expect(authHeaderFor(good)).toEqual(["Bearer ghs_secret"]);
    expect(upload.mock.calls.map((c) => c[0])).toEqual(["repos/p1/main/src/a.ts"]);
  });
});

describe("GitLab/Bitbucket URL builders", () => {
  it("encodes the GitLab project, path and ref", () => {
    expect(gitlabTreeUrl("group/sub/app", "feature/x", "src")).toBe(
      "https://gitlab.com/api/v4/projects/group%2Fsub%2Fapp/repository/tree?ref=feature%2Fx&path=src&per_page=100"
    );
    expect(gitlabRawFileUrl("group/app", "src/a b.ts", "main")).toBe(
      "https://gitlab.com/api/v4/projects/group%2Fapp/repository/files/src%2Fa%20b.ts/raw?ref=main"
    );
  });

  it("encodes Bitbucket segments and rejects traversal", () => {
    expect(bitbucketSrcUrl("ws", "app", "main", "src/a b.ts")).toBe(
      "https://api.bitbucket.org/2.0/repositories/ws/app/src/main/src/a%20b.ts"
    );
    expect(() => bitbucketSrcUrl("ws", "app", "main", "../../../user")).toThrow(UnsafeRepoPathError);
    expect(() => gitlabRawFileUrl("group/app", "src/%2e%2e/x", "main")).toThrow(UnsafeRepoPathError);
    expect(() => gitlabTreeUrl("group/../other", "main", "")).toThrow(UnsafeRepoPathError);
  });

  it("only follows Bitbucket pagination within the same listing", () => {
    const ok = "https://api.bitbucket.org/2.0/repositories/ws/app/src/main/?page=2";
    expect(assertBitbucketPageUrl(ok, "ws", "app")).toBe(ok);
    expect(() => assertBitbucketPageUrl("https://evil.io/2.0/repositories/ws/app/src/", "ws", "app")).toThrow();
    expect(() => assertBitbucketPageUrl("https://api.bitbucket.org/2.0/user", "ws", "app")).toThrow();
  });

  it("Bitbucket clone refuses a poisoned `next` link before sending the token", async () => {
    fetchMock.mockResolvedValueOnce(json({ values: [], next: "https://evil.io/next" }));

    await expect(cloneBitbucketRepository("ws", "app", "main", "bb_secret", "repos/p1/main")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("GitLab clone requests only encoded, validated URLs", async () => {
    fetchMock
      .mockResolvedValueOnce(json([{ name: "a.ts", path: "src/a.ts", type: "blob", size: 1 }]))
      .mockResolvedValueOnce(new Response("x", { status: 200 }));

    await cloneGitLabRepository("group/app", "main", "gl_secret", "repos/p1/main");

    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      "https://gitlab.com/api/v4/projects/group%2Fapp/repository/tree?ref=main&path=%2F&per_page=100",
      "https://gitlab.com/api/v4/projects/group%2Fapp/repository/files/src%2Fa.ts/raw?ref=main",
    ]);
  });
});
