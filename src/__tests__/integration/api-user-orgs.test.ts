import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.ENCRYPTION_KEY = "a".repeat(64);

const db = vi.hoisted(() => ({ account: { findFirst: vi.fn() } }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/github/app", () => ({ isGitHubAppConfigured: () => false }));
vi.mock("@/server/http/session", async () => (await import("../helpers/route-auth")).sessionMock());
vi.mock("@/server/http/auth", async (orig) =>
  (await import("../helpers/route-auth")).authMock(await orig<Record<string, unknown>>())
);

import { GET } from "@/app/api/user/orgs/route";
import { encryptToken } from "@/lib/vault/token";
import { NextRequest } from "next/server";
import { resetRouteAuth } from "../helpers/route-auth";

const request = () => new NextRequest("http://localhost/api/user/orgs");

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  resetRouteAuth();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
  db.account.findFirst.mockResolvedValue(null);
});

describe("GET /api/user/orgs token handling", () => {
  it("sends the decrypted token to GitHub", async () => {
    db.account.findFirst.mockResolvedValue({ access_token: encryptToken("ghu_real") });
    await GET(request());
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer ghu_real");
  });

  it("still works with a legacy plaintext row", async () => {
    db.account.findFirst.mockResolvedValue({ access_token: "gho_legacy" });
    await GET(request());
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer gho_legacy");
  });

  it("401s without calling GitHub when there is no usable token", async () => {
    db.account.findFirst.mockResolvedValue({ access_token: "enc:v1:bad:bad" });
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
