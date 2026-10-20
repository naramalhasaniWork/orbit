import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const dnsMock = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("dns/promises", () => dnsMock);

import { assertPublicUrl, safeFetch, UnsafeUrlError } from "@/lib/utils/ssrf";

const PUBLIC = [{ address: "93.184.216.34", family: 4 }];
const fetchMock = vi.fn();

function redirect(location: string, status = 302) {
  return new Response(null, { status, headers: { location } });
}

beforeEach(() => {
  vi.clearAllMocks();
  dnsMock.lookup.mockResolvedValue(PUBLIC);
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("assertPublicUrl", () => {
  it("accepts public http and https URLs", async () => {
    await expect(assertPublicUrl("https://app.example.com/login")).resolves.toBeInstanceOf(URL);
    await expect(assertPublicUrl("http://app.example.com")).resolves.toBeInstanceOf(URL);
  });

  it.each(["file:///etc/passwd", "ftp://example.com", "gopher://example.com", "javascript:alert(1)"])(
    "rejects protocol in %s",
    async (url) => {
      await expect(assertPublicUrl(url)).rejects.toThrow(UnsafeUrlError);
    }
  );

  it("rejects malformed URLs and embedded credentials", async () => {
    await expect(assertPublicUrl("not a url")).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicUrl("https://user:pw@example.com")).rejects.toThrow(/credentials/);
  });

  it.each([
    "http://127.0.0.1",
    "http://127.1",
    "http://2130706433", // decimal form of 127.0.0.1
    "http://0x7f.0.0.1",
    "http://0.0.0.0",
    "http://10.1.2.3",
    "http://172.16.0.1",
    "http://172.31.255.255",
    "http://192.168.1.1",
    "http://169.254.169.254/latest/meta-data",
    "http://100.64.0.1",
    "http://100.127.255.255",
    "http://[::1]",
    "http://[::]",
    "http://[fe80::1]",
    "http://[fd00::1]",
    "http://[::ffff:127.0.0.1]",
    "http://[::ffff:7f00:1]",
    "http://[::ffff:169.254.169.254]",
    "http://[64:ff9b::a00:1]",
  ])("blocks IP literal %s", async (url) => {
    await expect(assertPublicUrl(url)).rejects.toThrow(UnsafeUrlError);
    expect(dnsMock.lookup).not.toHaveBeenCalled();
  });

  it("allows public IP literals just outside the blocked ranges", async () => {
    await expect(assertPublicUrl("http://172.32.0.1")).resolves.toBeDefined();
    await expect(assertPublicUrl("http://100.128.0.1")).resolves.toBeDefined();
    await expect(assertPublicUrl("http://8.8.8.8")).resolves.toBeDefined();
    await expect(assertPublicUrl("http://[2606:4700:4700::1111]")).resolves.toBeDefined();
  });

  it.each([
    "http://localhost:3000",
    "http://app.localhost",
    "http://db.internal",
    "http://web.railway.internal:8080",
    "http://printer.local",
    "http://db.internal./",
  ])("blocks internal hostname %s without resolving", async (url) => {
    await expect(assertPublicUrl(url)).rejects.toThrow(/internal hostname/);
    expect(dnsMock.lookup).not.toHaveBeenCalled();
  });

  it("blocks a public-looking name that resolves to a private address", async () => {
    dnsMock.lookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
    await expect(assertPublicUrl("https://evil.example.com")).rejects.toThrow(/resolves to/);
  });

  it("blocks when any resolved record is private", async () => {
    dnsMock.lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "::1", family: 6 },
    ]);
    await expect(assertPublicUrl("https://mixed.example.com")).rejects.toThrow(UnsafeUrlError);
  });

  it("fails closed on DNS errors", async () => {
    dnsMock.lookup.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(assertPublicUrl("https://nope.example.com")).rejects.toThrow(/Cannot resolve/);
  });

  describe("ORBIT_ALLOW_PRIVATE_TARGETS=true", () => {
    beforeEach(() => vi.stubEnv("ORBIT_ALLOW_PRIVATE_TARGETS", "true"));

    it("allows localhost, private ranges and internal names", async () => {
      await expect(assertPublicUrl("http://localhost:3000")).resolves.toBeDefined();
      await expect(assertPublicUrl("http://192.168.1.10")).resolves.toBeDefined();
      await expect(assertPublicUrl("http://app.internal")).resolves.toBeDefined();
    });

    it("still enforces protocol and keeps link-local (cloud metadata) blocked", async () => {
      await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow(UnsafeUrlError);
      await expect(assertPublicUrl("http://169.254.169.254")).rejects.toThrow(/link-local/);
    });
  });

  it("only the literal string 'true' enables the opt-out", async () => {
    vi.stubEnv("ORBIT_ALLOW_PRIVATE_TARGETS", "1");
    await expect(assertPublicUrl("http://127.0.0.1")).rejects.toThrow(UnsafeUrlError);
  });
});

describe("safeFetch", () => {
  it("never lets fetch follow redirects itself", async () => {
    fetchMock.mockResolvedValue(new Response("ok"));
    await safeFetch("https://example.com", { redirect: "follow" });
    expect(fetchMock.mock.calls[0][1].redirect).toBe("manual");
  });

  it("follows a redirect to another public host", async () => {
    fetchMock
      .mockResolvedValueOnce(redirect("https://other.example.com/next"))
      .mockResolvedValueOnce(new Response("done"));
    const res = await safeFetch("https://example.com");
    expect(await res.text()).toBe("done");
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://other.example.com/next");
  });

  it("blocks a redirect to cloud metadata", async () => {
    fetchMock.mockResolvedValueOnce(redirect("http://169.254.169.254/latest/meta-data"));
    await expect(safeFetch("https://example.com")).rejects.toThrow(UnsafeUrlError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks a redirect to a hostname that resolves privately", async () => {
    fetchMock.mockResolvedValueOnce(redirect("https://rebind.example.com"));
    dnsMock.lookup
      .mockResolvedValueOnce(PUBLIC)
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    await expect(safeFetch("https://example.com")).rejects.toThrow(/resolves to/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks a redirect to a non-http scheme", async () => {
    fetchMock.mockResolvedValueOnce(redirect("file:///etc/passwd"));
    await expect(safeFetch("https://example.com")).rejects.toThrow(/Protocol/);
  });

  it("resolves relative redirects against the current URL", async () => {
    fetchMock
      .mockResolvedValueOnce(redirect("/login"))
      .mockResolvedValueOnce(new Response("ok"));
    await safeFetch("https://example.com/start");
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://example.com/login");
  });

  it("stops after 5 redirects", async () => {
    fetchMock.mockImplementation(async () => redirect("https://example.com/loop"));
    await expect(safeFetch("https://example.com")).rejects.toThrow(/Too many redirects/);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("drops Authorization on cross-origin redirects but keeps it same-origin", async () => {
    fetchMock
      .mockResolvedValueOnce(redirect("/same"))
      .mockResolvedValueOnce(redirect("https://other.example.com/x"))
      .mockResolvedValueOnce(new Response("ok"));
    await safeFetch("https://example.com", { headers: { Authorization: "Bearer t" } });
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get("authorization")).toBe("Bearer t");
    expect(new Headers(fetchMock.mock.calls[2][1].headers).get("authorization")).toBeNull();
  });

  it("turns POST into GET without a body on 302", async () => {
    fetchMock
      .mockResolvedValueOnce(redirect("/next", 302))
      .mockResolvedValueOnce(new Response("ok"));
    await safeFetch("https://example.com", { method: "POST", body: "{}" });
    expect(fetchMock.mock.calls[1][1].method).toBe("GET");
    expect(fetchMock.mock.calls[1][1].body).toBeUndefined();
  });

  it("does not call fetch at all for a blocked initial URL", async () => {
    await expect(safeFetch("http://127.0.0.1:6379")).rejects.toThrow(UnsafeUrlError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
