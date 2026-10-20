import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

// Radix warns at runtime when a DialogContent has no title for screen readers.
describe("dialog accessibility", () => {
  const root = path.resolve(__dirname, "../../components");
  const withDialogs = tsxFiles(root).filter(
    (f) => !f.endsWith(path.join("ui", "dialog.tsx")) && readFileSync(f, "utf8").includes("<DialogContent")
  );

  it("finds the dialogs", () => {
    expect(withDialogs.length).toBeGreaterThan(0);
  });

  it.each(withDialogs.map((f) => [path.relative(root, f), f]))("%s renders a DialogTitle", (_name, file) => {
    const src = readFileSync(file, "utf8");
    const contents = (src.match(/<DialogContent/g) ?? []).length;
    const titles = (src.match(/<DialogTitle/g) ?? []).length;
    expect(titles).toBeGreaterThanOrEqual(contents);
  });
});
