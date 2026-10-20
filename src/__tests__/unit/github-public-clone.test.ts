import { describe, it, expect } from "vitest";
import { planPublicClone, MAX_PUBLIC_FILES, MAX_PUBLIC_FILE_BYTES } from "@/services/indexing/adapters/github-public-clone";
import { isInIgnoredDir } from "@/services/indexing/file-filters";

const blob = (path: string, size = 10) => ({ path, type: "blob" as const, size });

describe("planPublicClone", () => {
  it("keeps indexable files and derives their directories", () => {
    const plan = planPublicClone([
      blob("src/app/page.tsx"),
      blob("README.md"),
      blob("package.json"),
      { path: "src", type: "tree" },
    ]);
    expect(plan.downloads).toEqual(["src/app/page.tsx", "package.json"]);
    expect(plan.fileTree.filter((f) => f.type === "dir").map((f) => f.path)).toEqual(["src", "src/app"]);
  });

  it("drops ignored directories at any depth", () => {
    const plan = planPublicClone([
      blob("node_modules/react/index.js"),
      blob("packages/web/node_modules/x/index.js"),
      blob("dist/main.js"),
      blob("src/index.ts"),
    ]);
    expect(plan.downloads).toEqual(["src/index.ts"]);
  });

  it("skips oversized files and counts them", () => {
    const plan = planPublicClone([blob("big.json", MAX_PUBLIC_FILE_BYTES + 1), blob("ok.json")]);
    expect(plan.downloads).toEqual(["ok.json"]);
    expect(plan.skipped).toBe(1);
  });

  it("caps the number of files", () => {
    const many = Array.from({ length: MAX_PUBLIC_FILES + 3 }, (_, i) => blob(`f${i}.ts`));
    const plan = planPublicClone(many);
    expect(plan.downloads).toHaveLength(MAX_PUBLIC_FILES);
    expect(plan.skipped).toBe(3);
  });

  it("ignores submodule entries", () => {
    expect(planPublicClone([{ path: "vendor/lib.ts", type: "commit" }]).downloads).toEqual([]);
  });
});

describe("isInIgnoredDir", () => {
  it("only looks at directory segments, not the file name", () => {
    expect(isInIgnoredDir("build")).toBe(false);
    expect(isInIgnoredDir("src/build.ts")).toBe(false);
    expect(isInIgnoredDir("build/out.js")).toBe(true);
  });
});
