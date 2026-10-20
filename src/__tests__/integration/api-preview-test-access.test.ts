import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  previewBinding: { findFirst: vi.fn() },
  previewDeployment: { findFirst: vi.fn() },
}));
const probeAccess = vi.hoisted(() => vi.fn());
const loadAccessSecrets = vi.hoisted(() => vi.fn());

vi.mock("@/server/http/session", async () => (await import("../helpers/route-auth")).sessionMock());
vi.mock("@/server/http/auth", async (orig) =>
  (await import("../helpers/route-auth")).authMock(await orig<Record<string, unknown>>())
);
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/services/execution/access-headers", () => ({ probeAccess }));
vi.mock("@/services/preview/binding-service", () => ({ loadAccessSecrets }));
vi.mock("@/lib/utils/ssrf", () => ({ assertPublicUrl: vi.fn(async () => undefined), UnsafeUrlError: class extends Error {} }));

import { POST } from "@/app/api/projects/[projectId]/preview-binding/test-access/route";
import { resetRouteAuth, routeAuth } from "../helpers/route-auth";

const call = (body: unknown) =>
  POST(new NextRequest("http://x/api/projects/p1/preview-binding/test-access", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ projectId: "p1" }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  resetRouteAuth();
  db.previewBinding.findFirst.mockResolvedValue({ id: "b1", allowedHostSuffixes: ["pages.dev"] });
  loadAccessSecrets.mockResolvedValue({ clientId: "stored.access", clientSecret: "stored-secret" });
  probeAccess.mockResolvedValue({ protectedWithoutToken: true, allowedWithToken: true, message: "ok" });
});

describe("POST preview-binding/test-access", () => {
  it("never sends the stored token to an allowlisted host that isn't one of this binding's previews", async () => {
    db.previewDeployment.findFirst.mockResolvedValue(null);
    const res = await call({ url: "https://attacker-owned.pages.dev" });

    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe("Test a URL from a recent preview, or enter the token");
    expect(loadAccessSecrets).not.toHaveBeenCalled();
    expect(probeAccess).not.toHaveBeenCalled();
  });

  it("uses the stored token for a URL of this binding's own ready preview", async () => {
    db.previewDeployment.findFirst.mockResolvedValue({ id: "pd1" });
    const res = await call({ url: "https://4f2a9c1e.acme.pages.dev/" });

    expect(res.status).toBe(200);
    expect(db.previewDeployment.findFirst).toHaveBeenCalledWith({
      where: { bindingId: "b1", status: "ready", url: "https://4f2a9c1e.acme.pages.dev" },
      select: { id: true },
    });
    expect(probeAccess).toHaveBeenCalledWith("https://4f2a9c1e.acme.pages.dev", {
      "CF-Access-Client-Id": "stored.access", "CF-Access-Client-Secret": "stored-secret",
    });
  });

  it("allows any allowlisted URL when the caller supplies their own token", async () => {
    const res = await call({ url: "https://anything.pages.dev", clientId: "mine.access", clientSecret: "mine" });

    expect(res.status).toBe(200);
    expect(db.previewDeployment.findFirst).not.toHaveBeenCalled();
    expect(loadAccessSecrets).not.toHaveBeenCalled();
    expect(probeAccess).toHaveBeenCalledWith("https://anything.pages.dev", {
      "CF-Access-Client-Id": "mine.access", "CF-Access-Client-Secret": "mine",
    });
  });

  it("requires integrations.manage as well as secrets.manage", async () => {
    routeAuth.role = "viewer"; // holds neither; only owner and admin hold both
    expect((await call({ url: "https://anything.pages.dev", clientId: "a", clientSecret: "b" })).status).toBe(403);
    expect(probeAccess).not.toHaveBeenCalled();
  });
});
