import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { createLocalStorage, sanitizeFilename } from "@/lib/storage";

describe("local storage path containment", () => {
  let root: string;
  let base: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "orbit-storage-"));
    base = join(root, "store");
    await writeFile(join(root, "secret.txt"), "top secret");
  });

  afterAll(() => rm(root, { recursive: true, force: true }));

  it("round-trips a normal key", async () => {
    const storage = createLocalStorage(base);
    await storage.upload("a/b/file.txt", Buffer.from("hi"), "text/plain");
    expect((await storage.download("a/b/file.txt")).toString()).toBe("hi");
  });

  it("refuses traversal on download and url", async () => {
    const storage = createLocalStorage(base);
    await expect(storage.download("../secret.txt")).rejects.toThrow(/Invalid storage key/);
    await expect(storage.getUrl("../../etc/passwd")).rejects.toThrow(/Invalid storage key/);
  });

  it("refuses traversal on upload and writes nothing outside the base", async () => {
    const storage = createLocalStorage(base);
    await expect(
      storage.upload("../evil.txt", Buffer.from("x"), "text/plain")
    ).rejects.toThrow(/Invalid storage key/);
    await expect(readFile(join(root, "evil.txt"))).rejects.toThrow();
  });

  it("refuses sibling directories sharing the base prefix and absolute paths", async () => {
    const storage = createLocalStorage(base);
    await expect(storage.download("../store-evil/x")).rejects.toThrow(/Invalid storage key/);
    await expect(storage.download("/etc/passwd")).rejects.toThrow(/Invalid storage key/);
  });
});

describe("sanitizeFilename", () => {
  it("strips directories and unsafe characters", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("..\\..\\win.ini")).toBe("win.ini");
    expect(sanitizeFilename("my file (1).md")).toBe("my_file__1_.md");
    expect(sanitizeFilename("..")).toBe("file");
    expect(sanitizeFilename(".hidden")).toBe("hidden");
  });
});
