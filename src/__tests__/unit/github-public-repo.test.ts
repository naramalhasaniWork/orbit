import { describe, it, expect } from "vitest";
import {
  parseGitHubRepoUrl,
  readRateLimit,
  fetchPublicRepo,
  describeRateLimit,
} from "@/lib/github/public-repo";

describe("parseGitHubRepoUrl", () => {
  it.each([
    ["https://github.com/vercel/next.js", "vercel", "next.js"],
    ["https://github.com/vercel/next.js/", "vercel", "next.js"],
    ["https://www.github.com/vercel/next.js.git", "vercel", "next.js"],
    ["http://github.com/o/r/tree/main/src", "o", "r"],
    ["github.com/o/r", "o", "r"],
    ["  https://github.com/o/r?tab=readme  ", "o", "r"],
    ["https://github.com/o/r#readme", "o", "r"],
    ["o/r", "o", "r"],
  ])("parses %s", (input, owner, repo) => {
    expect(parseGitHubRepoUrl(input)).toEqual({ owner, repo });
  });

  it.each([
    "",
    "not a url",
    "https://gitlab.com/o/r",
    "https://github.com/o",
    "https://github.com/",
    "https://github.com/../r",
    "https://github.com/o/..",
    "https://github.com/-bad-/r",
    "https://evil.com/github.com/o/r",
    "https://github.com.evil.com/o/r",
    "javascript:alert(1)",
    "https://github.com/o/r with space",
  ])("rejects %s", (input) => {
    expect(parseGitHubRepoUrl(input)).toBeNull();
  });
});

describe("readRateLimit", () => {
  it("reads remaining and reset", () => {
    const h = new Headers({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1800000000" });
    expect(readRateLimit(h)).toEqual({ remaining: 0, resetAt: new Date(1800000000 * 1000) });
  });

  it("returns null when headers are missing or junk", () => {
    expect(readRateLimit(new Headers())).toBeNull();
    expect(readRateLimit(new Headers({ "x-ratelimit-remaining": "abc" }))).toBeNull();
  });
});

describe("describeRateLimit", () => {
  it("mentions the reset time when known", () => {
    const msg = describeRateLimit(new Date("2026-10-20T15:30:00Z"), new Date("2026-10-20T15:00:00Z"));
    expect(msg).toContain("30 minutes");
  });

  it("falls back without a reset time", () => {
    expect(describeRateLimit(null)).toMatch(/try again/i);
  });
});

const repoJson = {
  id: 1,
  name: "next.js",
  full_name: "vercel/next.js",
  private: false,
  language: "JavaScript",
  stargazers_count: 100,
  default_branch: "canary",
  updated_at: "2026-10-01T00:00:00Z",
  html_url: "https://github.com/vercel/next.js",
  owner: { login: "vercel", avatar_url: "https://a/b.png" },
};

function fakeFetch(res: Response) {
  return async () => res;
}

describe("fetchPublicRepo", () => {
  it("maps a public repo to a RepoItem", async () => {
    const result = await fetchPublicRepo("vercel", "next.js", fakeFetch(Response.json(repoJson)));
    expect(result).toEqual({
      ok: true,
      repo: {
        id: "1",
        name: "next.js",
        fullName: "vercel/next.js",
        owner: "vercel",
        ownerAvatar: "https://a/b.png",
        language: "JavaScript",
        stars: 100,
        defaultBranch: "canary",
        updatedAt: "2026-10-01T00:00:00Z",
        isPrivate: false,
        url: "https://github.com/vercel/next.js",
      },
    });
  });

  it("treats 404 as not found or private", async () => {
    const result = await fetchPublicRepo("o", "r", fakeFetch(new Response("{}", { status: 404 })));
    expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("reports rate limiting with the reset time", async () => {
    const res = new Response("{}", {
      status: 403,
      headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1800000000" },
    });
    const result = await fetchPublicRepo("o", "r", fakeFetch(res));
    expect(result).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    expect(result.ok === false && result.retryAt).toEqual(new Date(1800000000 * 1000));
  });

  it("treats 429 as rate limited too", async () => {
    const result = await fetchPublicRepo("o", "r", fakeFetch(new Response("{}", { status: 429 })));
    expect(result).toMatchObject({ ok: false, code: "RATE_LIMITED" });
  });

  it("does not confuse a plain 403 with rate limiting", async () => {
    const res = new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "42" } });
    expect(await fetchPublicRepo("o", "r", fakeFetch(res))).toMatchObject({ ok: false, code: "UPSTREAM" });
  });

  it("rejects private repos even if the API returned them", async () => {
    const result = await fetchPublicRepo("o", "r", fakeFetch(Response.json({ ...repoJson, private: true })));
    expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("handles network failures", async () => {
    const result = await fetchPublicRepo("o", "r", async () => {
      throw new Error("offline");
    });
    expect(result).toMatchObject({ ok: false, code: "UPSTREAM" });
  });
});
