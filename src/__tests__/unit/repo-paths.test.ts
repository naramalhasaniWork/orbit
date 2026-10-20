import { describe, it, expect } from "vitest";
import {
  assertSafeRepoPath,
  githubContentsUrl,
  githubRepoApiUrl,
  githubRepoUrl,
  repoStorageKey,
  UnsafeRepoPathError,
} from "@/lib/github/repo-paths";

const UNSAFE_PATHS = [
  "../secrets",
  "src/../../orgs/acme",
  "/etc/passwd",
  "src\\..\\x",
  "src/%2e%2e/x",
  "src%2Fx",
  "src/%5c",
  "src//x",
  "./src",
  "src/\u0000x",
];

describe("assertSafeRepoPath", () => {
  it.each(UNSAFE_PATHS)("rejects %j", (path) => {
    expect(() => assertSafeRepoPath(path)).toThrow(UnsafeRepoPathError);
  });

  it("accepts ordinary repo paths, including dotfiles and '...' names", () => {
    for (const ok of ["src/app/page.tsx", ".github/workflows/ci.yml", "a/.../b.ts", "feature/login"]) {
      expect(assertSafeRepoPath(ok)).toBe(ok);
    }
  });
});

describe("githubContentsUrl", () => {
  it("encodes each segment, owner, repo and ref", () => {
    expect(githubContentsUrl("acme", "app", "src/a b#c.ts", "feature/x")).toBe(
      "https://api.github.com/repos/acme/app/contents/src/a%20b%23c.ts?ref=feature%2Fx"
    );
  });

  it("lists the repo root for an empty path", () => {
    expect(githubContentsUrl("acme", "app", "", "main")).toBe(
      "https://api.github.com/repos/acme/app/contents/?ref=main"
    );
  });

  it.each(UNSAFE_PATHS)("never builds a URL for %j", (path) => {
    expect(() => githubContentsUrl("acme", "app", path, "main")).toThrow(UnsafeRepoPathError);
  });

  it("rejects traversal in the ref and bad owner/repo names", () => {
    expect(() => githubContentsUrl("acme", "app", "a.ts", "../../orgs")).toThrow(UnsafeRepoPathError);
    expect(() => githubContentsUrl("acme/../orgs", "app", "a.ts")).toThrow(UnsafeRepoPathError);
    expect(() => githubContentsUrl("acme", "..", "a.ts")).toThrow(UnsafeRepoPathError);
  });
});

describe("githubRepoApiUrl", () => {
  it("keeps every segment inside the repo, encoding slashes", () => {
    const url = githubRepoApiUrl("acme", "app", ["commits", "feature/x"]);
    expect(url).toBe("https://api.github.com/repos/acme/app/commits/feature%2Fx");
    expect(new URL(url).pathname.startsWith("/repos/acme/app/")).toBe(true);
  });

  it("rejects dot segments and adds query params", () => {
    expect(() => githubRepoApiUrl("acme", "app", [".."])).toThrow(UnsafeRepoPathError);
    expect(githubRepoApiUrl("acme", "app", ["pulls", 7, "files"], { per_page: "100" })).toBe(
      "https://api.github.com/repos/acme/app/pulls/7/files?per_page=100"
    );
  });

  it("builds the bare repo URL", () => {
    expect(githubRepoUrl("acme", "app.js")).toBe("https://api.github.com/repos/acme/app.js");
  });
});

describe("repoStorageKey", () => {
  it("builds keys under the project and branch", () => {
    expect(repoStorageKey("p1", "feature/x", "src/a.ts")).toBe("repos/p1/feature/x/src/a.ts");
    expect(repoStorageKey("p1", "main")).toBe("repos/p1/main");
  });

  it("rejects traversal in branch or path", () => {
    expect(() => repoStorageKey("p1", "main", "../../p2/main/x")).toThrow(UnsafeRepoPathError);
    expect(() => repoStorageKey("p1", "../p2")).toThrow(UnsafeRepoPathError);
  });
});
