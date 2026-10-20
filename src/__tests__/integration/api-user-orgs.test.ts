import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.ENCRYPTION_KEY = "a".repeat(64);

const db = vi.hoisted(() => ({ account: { findFirst: vi.fn() } }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/github/app", () => ({ isGitHubAppConfigured: () => false }));
vi.mock("@/lib/utils/api", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireWorkspace: vi.fn(async () => ({ session: { user: { id: "u1" } }, workspaceId: "ws-1" })),
    apiSuccess: (data: unknown) => NextResponse.json({ success: true, data }),
    apiError: (m: string, c: string, s = 400) => NextResponse.json({ error: { m, c } }, { status: s }),
    handleApiError: () => NextResponse.json({}, { status: 500 }),
  };
});

import { GET } from "@/app/api/user/orgs/route";
import { encryptToken } from "@/lib/vault/token";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
  db.account.findFirst.mockResolvedValue(null);
});

describe("GET /api/user/orgs token handling", () => {
  it("sends the decrypted token to GitHub", async () => {
    db.account.findFirst.mockResolvedValue({ access_token: encryptToken("ghu_real") });
    await GET();
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer ghu_real");
  });

  it("still works with a legacy plaintext row", async () => {
    db.account.findFirst.mockResolvedValue({ access_token: "gho_legacy" });
    await GET();
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer gho_legacy");
  });

  it("401s without calling GitHub when there is no usable token", async () => {
    db.account.findFirst.mockResolvedValue({ access_token: "enc:v1:bad:bad" });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
