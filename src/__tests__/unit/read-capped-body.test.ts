import { describe, it, expect } from "vitest";
import { readCappedBody } from "@/server/http/read-capped-body";
import { HttpError } from "@/server/http/errors";

const URL_ = "http://localhost/api/upload";

/** A body the runtime cannot size up front, delivered in 1 KB chunks; counts what was pulled. */
function streamOf(bytes: number) {
  const pulled = { bytes: 0 };
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled.bytes >= bytes) return controller.close();
      const chunk = new Uint8Array(Math.min(1024, bytes - pulled.bytes)).fill(0x61);
      pulled.bytes += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });
  return { stream, pulled };
}

function request(body: BodyInit, headers: Record<string, string> = {}) {
  return new Request(URL_, { method: "POST", body, headers, duplex: "half" } as RequestInit);
}

async function status(promise: Promise<unknown>): Promise<number | "ok"> {
  try {
    await promise;
    return "ok";
  } catch (err) {
    if (err instanceof HttpError) return err.status;
    throw err;
  }
}

describe("readCappedBody", () => {
  it("passes a body within the cap through, re-parseable as form data", async () => {
    const form = new FormData();
    form.append("message", "hello");
    const encoded = new Response(form);
    const bytes = new Uint8Array(await encoded.arrayBuffer());
    const req = request(bytes, {
      "content-type": encoded.headers.get("content-type") ?? "",
      "content-length": String(bytes.byteLength),
    });

    const capped = await readCappedBody(req, 1024);
    expect((await capped.formData()).get("message")).toBe("hello");
    expect(capped.headers.get("content-length")).toBe(String(bytes.byteLength));
  });

  it("413s when Content-Length is missing, even before reading the body", async () => {
    const { stream, pulled } = streamOf(64 * 1024);
    expect(await status(readCappedBody(request(stream), 1024))).toBe(413);
    expect(pulled.bytes).toBeLessThanOrEqual(2048);
  });

  it("413s when Content-Length is malformed or over the cap", async () => {
    for (const value of ["", "abc", "-1", "1e3", "12.5", "2048"]) {
      expect(await status(readCappedBody(request("x", { "content-length": value }), 1024))).toBe(413);
    }
  });

  it("413s when Content-Length lies, and stops reading once past the cap", async () => {
    const { stream, pulled } = streamOf(64 * 1024);
    const req = request(stream, { "content-length": "10" });
    expect(await status(readCappedBody(req, 4096))).toBe(413);
    expect(pulled.bytes).toBeLessThan(64 * 1024);
  });

  it("accepts a body of exactly the cap", async () => {
    const capped = await readCappedBody(request(new Uint8Array(1024), { "content-length": "1024" }), 1024);
    expect((await capped.arrayBuffer()).byteLength).toBe(1024);
  });
});
