import { describe, it, expect } from "vitest";
import {
  parseGitLogOutput,
  aggregateChangeFrequency,
} from "@/services/indexing/git-history";
import type { FileChange } from "@/services/indexing/git-history";

// ============================================================
// parseGitLogOutput
// ============================================================

describe("parseGitLogOutput", () => {
  it("parses multi-commit git log --stat output", () => {
    const hash1 = "abc1234567890abcdef1234567890abcdef1234";
    const hash2 = "def4567890abcdef1234567890abcdef12345678";
    const output = `commit ${hash1}
Date:   2026-04-01 10:00:00 +0000

    feat: add login page

 src/pages/login.tsx | 42 +++++++++++++++
 src/lib/auth.ts     | 15 +++--

 2 files changed, 50 insertions(+), 7 deletions(-)

commit ${hash2}
Date:   2026-03-28 14:30:00 +0000

    fix: correct token validation

 src/lib/auth.ts         | 8 ++---
 src/middleware/guard.ts  | 3 ++-

 2 files changed, 6 insertions(+), 5 deletions(-)
`;

    const changes = parseGitLogOutput(output);

    expect(changes).toHaveLength(4);

    expect(changes[0]).toEqual({
      filePath: "src/pages/login.tsx",
      commitHash: hash1,
      date: "2026-04-01 10:00:00 +0000",
      message: "feat: add login page",
      changeCount: 42,
    });

    expect(changes[1]).toEqual({
      filePath: "src/lib/auth.ts",
      commitHash: hash1,
      date: "2026-04-01 10:00:00 +0000",
      message: "feat: add login page",
      changeCount: 15,
    });

    expect(changes[2]).toEqual({
      filePath: "src/lib/auth.ts",
      commitHash: hash2,
      date: "2026-03-28 14:30:00 +0000",
      message: "fix: correct token validation",
      changeCount: 8,
    });

    expect(changes[3]).toEqual({
      filePath: "src/middleware/guard.ts",
      commitHash: hash2,
      date: "2026-03-28 14:30:00 +0000",
      message: "fix: correct token validation",
      changeCount: 3,
    });
  });

  it("returns empty array for empty output", () => {
    expect(parseGitLogOutput("")).toEqual([]);
    expect(parseGitLogOutput("   \n\n  ")).toEqual([]);
  });

  it("handles single file in a commit", () => {
    const output = `commit aaaa00001111222233334444555566667777
Date:   2026-04-05 09:00:00 +0000

    chore: update readme

 README.md | 2 +-

 1 file changed, 1 insertion(+), 1 deletion(-)
`;

    const changes = parseGitLogOutput(output);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.filePath).toBe("README.md");
    expect(changes[0]?.changeCount).toBe(2);
  });

  it("handles files with spaces in names", () => {
    const output = `commit bbbb1111222233334444555566667777888899
Date:   2026-04-06 12:00:00 +0000

    docs: update user guide

 docs/user guide.md       | 10 +++++++
 src/my component.tsx      | 5 ++--

 2 files changed, 12 insertions(+), 3 deletions(-)
`;

    const changes = parseGitLogOutput(output);
    expect(changes).toHaveLength(2);
    expect(changes[0]?.filePath).toBe("docs/user guide.md");
    expect(changes[1]?.filePath).toBe("src/my component.tsx");
  });

  it("handles commit with no stat lines", () => {
    const output = `commit cccc00001111222233334444555566667777
Date:   2026-04-07 08:00:00 +0000

    empty merge commit

`;

    const changes = parseGitLogOutput(output);
    expect(changes).toHaveLength(0);
  });
});

// ============================================================
// aggregateChangeFrequency
// ============================================================

describe("aggregateChangeFrequency", () => {
  it("aggregates commit counts and total changes per file", () => {
    const changes: FileChange[] = [
      {
        filePath: "src/auth.ts",
        commitHash: "aaa",
        date: "2026-04-01",
        message: "feat: login",
        changeCount: 10,
      },
      {
        filePath: "src/auth.ts",
        commitHash: "bbb",
        date: "2026-04-03",
        message: "fix: token",
        changeCount: 5,
      },
      {
        filePath: "src/page.tsx",
        commitHash: "aaa",
        date: "2026-04-01",
        message: "feat: login",
        changeCount: 20,
      },
    ];

    const freq = aggregateChangeFrequency(changes);

    expect(freq.size).toBe(2);

    const authFreq = freq.get("src/auth.ts");
    expect(authFreq).toBeDefined();
    expect(authFreq?.commitCount).toBe(2);
    expect(authFreq?.totalChanges).toBe(15);
    expect(authFreq?.lastChanged).toBe("2026-04-03");
    expect(authFreq?.recentCommitMessages).toEqual([
      "feat: login",
      "fix: token",
    ]);

    const pageFreq = freq.get("src/page.tsx");
    expect(pageFreq).toBeDefined();
    expect(pageFreq?.commitCount).toBe(1);
    expect(pageFreq?.totalChanges).toBe(20);
  });

  it("caps recent commit messages at 5", () => {
    const changes: FileChange[] = Array.from({ length: 8 }, (_, i) => ({
      filePath: "src/hot-file.ts",
      commitHash: `hash${i}`,
      date: `2026-04-0${i + 1}`,
      message: `commit ${i}`,
      changeCount: 1,
    }));

    const freq = aggregateChangeFrequency(changes);
    const entry = freq.get("src/hot-file.ts");
    expect(entry?.recentCommitMessages).toHaveLength(5);
    expect(entry?.commitCount).toBe(8);
  });

  it("handles empty changes array", () => {
    const freq = aggregateChangeFrequency([]);
    expect(freq.size).toBe(0);
  });

  it("deduplicates identical commit messages", () => {
    const changes: FileChange[] = [
      {
        filePath: "src/index.ts",
        commitHash: "aaa",
        date: "2026-04-01",
        message: "same message",
        changeCount: 5,
      },
      {
        filePath: "src/index.ts",
        commitHash: "bbb",
        date: "2026-04-02",
        message: "same message",
        changeCount: 3,
      },
    ];

    const freq = aggregateChangeFrequency(changes);
    const entry = freq.get("src/index.ts");
    expect(entry?.recentCommitMessages).toEqual(["same message"]);
    expect(entry?.commitCount).toBe(2);
  });

  it("tracks lastChanged as the most recent date", () => {
    const changes: FileChange[] = [
      {
        filePath: "src/a.ts",
        commitHash: "ccc",
        date: "2026-04-05",
        message: "latest",
        changeCount: 1,
      },
      {
        filePath: "src/a.ts",
        commitHash: "aaa",
        date: "2026-04-01",
        message: "oldest",
        changeCount: 1,
      },
      {
        filePath: "src/a.ts",
        commitHash: "bbb",
        date: "2026-04-03",
        message: "middle",
        changeCount: 1,
      },
    ];

    const freq = aggregateChangeFrequency(changes);
    expect(freq.get("src/a.ts")?.lastChanged).toBe("2026-04-05");
  });
});
