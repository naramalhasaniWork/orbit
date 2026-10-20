import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import http from "http";
import type { AddressInfo } from "net";

const dnsMock = vi.hoisted(() => ({
  lookup: vi.fn(),
}));
vi.mock("dns", () => dnsMock);

import { guardedLookup, pinnedRequest } from "@/lib/utils/ssrf-transport";
import { UnsafeUrlError } from "@/lib/utils/ssrf-rules";

/** Make dns.lookup answer with the given addresses (callback style, `all: true`). */
function resolvesTo(...addresses: string[]) {
  dnsMock.lookup.mockImplementation(
    (_host: string, _opts: unknown, cb: (e: Error | null, a: unknown[]) => void) =>
      cb(null, addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })))
  );
}

let hits = 0;
let server: http.Server;
let port: number;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    hits++;
    if (req.url === "/redirect") {
      res.writeHead(302, { location: "http://169.254.169.254/" }).end();
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.writeHead(200, { "content-type": "text/plain", "x-seen-encoding": String(req.headers["accept-encoding"]) });
      res.end(`${req.method} ${req.url} ${body}`);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => server.close());
afterEach(() => {
  vi.unstubAllEnvs();
  hits = 0;
});

const get = (host: string) =>
  pinnedRequest(new URL(`http://${host}:${port}/hello`), { method: "GET", headers: new Headers() });

describe("guardedLookup", () => {
  const run = (host: string, opts: { all?: boolean } = {}) =>
    new Promise<{ err: Error | null; result: unknown }>((resolve) =>
      guardedLookup(host, opts, (err, address) => resolve({ err, result: address }))
    );

  it("returns public addresses", async () => {
    resolvesTo("93.184.216.34");
    const { err, result } = await run("example.com");
    expect(err).toBeNull();
    expect(result).toBe("93.184.216.34");
  });

  it("rejects when the answer is private (DNS rebinding)", async () => {
    resolvesTo("127.0.0.1");
    const { err } = await run("rebind.example.com");
    expect(err).toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects a mixed public/private answer, including with all:true", async () => {
    resolvesTo("93.184.216.34", "10.0.0.5");
    expect((await run("mixed.example.com", { all: true })).err).toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects metadata addresses, even IPv4-mapped", async () => {
    resolvesTo("::ffff:169.254.169.254");
    expect((await run("meta.example.com")).err).toBeInstanceOf(UnsafeUrlError);
  });
});

describe("pinnedRequest", () => {
  it("never connects when the host resolves privately at connect time", async () => {
    resolvesTo("127.0.0.1"); // pre-check passed earlier; the second resolution is the attack
    await expect(get("rebind.example.com")).rejects.toThrow(/resolves to a/);
    expect(hits).toBe(0);
  });

  it("connects to a checked address when private targets are allowed", async () => {
    vi.stubEnv("ORBIT_ALLOW_PRIVATE_TARGETS", "true");
    resolvesTo("127.0.0.1");
    const res = await get("local.example.com");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("GET /hello ");
    expect(hits).toBe(1);
  });

  it("sends bodies, disables compression, and hands redirects back unfollowed", async () => {
    vi.stubEnv("ORBIT_ALLOW_PRIVATE_TARGETS", "true");
    resolvesTo("127.0.0.1");
    const post = await pinnedRequest(new URL(`http://x.example.com:${port}/p`), {
      method: "POST",
      headers: new Headers({ "content-type": "application/json" }),
      body: '{"a":1}',
    });
    expect(await post.text()).toBe('POST /p {"a":1}');
    expect(post.headers.get("x-seen-encoding")).toBe("identity");

    const redirect = await pinnedRequest(new URL(`http://x.example.com:${port}/redirect`), {
      method: "GET",
      headers: new Headers(),
    });
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe("http://169.254.169.254/");
    expect(hits).toBe(2);
  });

  it("supports HEAD without a body", async () => {
    vi.stubEnv("ORBIT_ALLOW_PRIVATE_TARGETS", "true");
    resolvesTo("127.0.0.1");
    const res = await pinnedRequest(new URL(`http://x.example.com:${port}/h`), {
      method: "HEAD",
      headers: new Headers(),
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });

  it("honours abort signals", async () => {
    vi.stubEnv("ORBIT_ALLOW_PRIVATE_TARGETS", "true");
    resolvesTo("127.0.0.1");
    const controller = new AbortController();
    controller.abort();
    await expect(
      pinnedRequest(new URL(`http://x.example.com:${port}/`), {
        method: "GET",
        headers: new Headers(),
        signal: controller.signal,
      })
    ).rejects.toThrow();
  });
});
