import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth/jwt", () => ({ getToken: vi.fn(async () => null) }));

import { middleware, config } from "@/middleware";

const req = (path: string) => new NextRequest(`http://localhost${path}`);

beforeEach(() => vi.stubEnv("ORBIT_SELF_HOSTED", ""));
afterEach(() => vi.unstubAllEnvs());

describe("middleware on a self-hosted instance", () => {
  beforeEach(() => vi.stubEnv("ORBIT_SELF_HOSTED", "true"));

  it.each([
    "/api/billing/checkout",
    "/api/billing/usage",
    "/api/billing/portal",
    "/api/webhooks/stripe",
  ])("returns 404 for %s", async (path) => {
    const res = await middleware(req(path));
    expect(res.status).toBe(404);
  });

  it("does not touch other webhooks or API routes", async () => {
    expect((await middleware(req("/api/webhooks/github"))).status).not.toBe(404);
  });

  it.each(["/pricing", "/features", "/about", "/blog", "/changelog", "/docs", "/docs/getting-started", "/content"])(
    "redirects marketing page %s to /login",
    async (path) => {
      const res = await middleware(req(path));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
    }
  );

  it.each(["/privacy", "/terms", "/security", "/login", "/pricing-policy"])("keeps %s reachable", async (path) => {
    const res = await middleware(req(path));
    expect(res.headers.get("location")).toBeNull();
  });

  it("runs on the marketing paths", () => {
    expect(config.matcher).toEqual(expect.arrayContaining(["/pricing/:path*", "/docs/:path*", "/features/:path*"]));
    expect(config.matcher).not.toContain("/privacy/:path*");
  });

  it("runs on the billing and stripe paths", () => {
    expect(config.matcher).toEqual(
      expect.arrayContaining(["/api/billing/:path*", "/api/webhooks/stripe"])
    );
  });
});

describe("middleware on cloud", () => {
  it("leaves marketing pages alone", async () => {
    expect((await middleware(req("/pricing"))).headers.get("location")).toBeNull();
  });

  it("lets billing routes through", async () => {
    expect((await middleware(req("/api/billing/usage"))).status).not.toBe(404);
    expect((await middleware(req("/api/webhooks/stripe"))).status).not.toBe(404);
  });
});
