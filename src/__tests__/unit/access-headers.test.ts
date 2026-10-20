import { describe, it, expect, vi, beforeEach } from "vitest";

const safeFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/utils/ssrf", () => ({ safeFetch }));

import type { BrowserContext, Route } from "playwright";
import {
  gateAccessCredentials, installAccessHeaders, isAccessRejection, probeAccess, splitAccessCredentials,
} from "@/services/execution/access-headers";

const creds = { TEST_EMAIL: "a@b.c", CF_ACCESS_CLIENT_ID: "id.access", CF_ACCESS_CLIENT_SECRET: "secret" };
const headers = { "CF-Access-Client-Id": "id.access", "CF-Access-Client-Secret": "secret" };

describe("Access credentials", () => {
  it("only cloudflare_access environments keep the Access secrets", () => {
    expect(gateAccessCredentials(creds, "public")).toEqual({ TEST_EMAIL: "a@b.c" });
    expect(gateAccessCredentials(creds, "cloudflare_access")).toEqual(creds);
  });

  it("splits the token into headers so the executor model never sees it", () => {
    expect(splitAccessCredentials(creds)).toEqual({ headers, credentials: { TEST_EMAIL: "a@b.c" } });
    expect(splitAccessCredentials({ CF_ACCESS_CLIENT_ID: "only-id" }).headers).toBeNull();
  });
});

describe("installAccessHeaders", () => {
  it("routes only the environment's origin and adds the headers there", async () => {
    let matcher: ((url: URL) => boolean) | undefined;
    let handler: ((route: Route) => unknown) | undefined;
    const context = {
      route: vi.fn(async (m: (url: URL) => boolean, h: (route: Route) => unknown) => {
        matcher = m;
        handler = h;
      }),
    } as unknown as BrowserContext;

    await installAccessHeaders(context, "https://abc.acme.pages.dev/app", headers);

    expect(matcher!(new URL("https://abc.acme.pages.dev/api/x"))).toBe(true);
    expect(matcher!(new URL("https://cdn.thirdparty.com/lib.js"))).toBe(false);
    expect(matcher!(new URL("http://abc.acme.pages.dev/"))).toBe(false);

    const cont = vi.fn();
    handler!({ request: () => ({ headers: () => ({ accept: "*/*" }) }), continue: cont } as unknown as Route);
    expect(cont).toHaveBeenCalledWith({ headers: { accept: "*/*", ...headers } });
  });
});

describe("Access rejection detection", () => {
  it("recognises the Access login redirect", () => {
    expect(isAccessRejection("https://acme.cloudflareaccess.com/cdn-cgi/access/login/x")).toBe(true);
    expect(isAccessRejection("https://abc.acme.pages.dev/")).toBe(false);
  });
});

describe("probeAccess", () => {
  beforeEach(() => {
    safeFetch.mockReset();
  });

  const redirectToLogin = new Response(null, {
    status: 302,
    headers: { location: "https://acme.cloudflareaccess.com/cdn-cgi/access/login/abc" },
  });

  it("reports protected and allowed when only the token gets through", async () => {
    safeFetch.mockResolvedValueOnce(redirectToLogin).mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const result = await probeAccess("https://abc.acme.pages.dev", headers);
    expect(result).toMatchObject({ protectedWithoutToken: true, allowedWithToken: true });
    expect(safeFetch).toHaveBeenLastCalledWith("https://abc.acme.pages.dev", { method: "GET", headers }, { followRedirects: false });
  });

  it("reports a rejected token", async () => {
    safeFetch.mockResolvedValueOnce(new Response(null, { status: 403 })).mockResolvedValueOnce(new Response(null, { status: 403 }));
    const result = await probeAccess("https://abc.acme.pages.dev", headers);
    expect(result).toMatchObject({ protectedWithoutToken: true, allowedWithToken: false });
    expect(result.message).toContain("rejected");
  });
});
