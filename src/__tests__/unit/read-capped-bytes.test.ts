import { describe, it, expect } from "vitest";
import { readCappedBytes } from "@/server/http/read-capped-body";
import { HttpError } from "@/server/http/errors";

function req(chunks: number[], contentLength?: string) {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const size of chunks) c.enqueue(new Uint8Array(size).fill(7));
      c.close();
    },
  });
  const headers: Record<string, string> = contentLength === undefined ? {} : { "content-length": contentLength };
  return new Request("http://localhost", { method: "POST", body, headers, duplex: "half" } as RequestInit & { duplex: "half" });
}

async function status(p: Promise<unknown>) {
  const err = await p.then(() => null, (e: unknown) => e);
  return err instanceof HttpError ? err.status : null;
}

describe("readCappedBytes", () => {
  it("returns every byte of a body within the cap", async () => {
    const bytes = await readCappedBytes(req([3, 4], "7"), 10);
    expect(Array.from(bytes)).toEqual([7, 7, 7, 7, 7, 7, 7]);
  });

  it("413s a missing, malformed or over-cap Content-Length", async () => {
    expect(await status(readCappedBytes(req([1]), 10))).toBe(413);
    expect(await status(readCappedBytes(req([1], "-1"), 10))).toBe(413);
    expect(await status(readCappedBytes(req([1], "abc"), 10))).toBe(413);
    expect(await status(readCappedBytes(req([1], "11"), 10))).toBe(413);
  });

  it("413s once the stream passes the cap, whatever the header said", async () => {
    expect(await status(readCappedBytes(req([6, 6], "5"), 10))).toBe(413);
  });
});
