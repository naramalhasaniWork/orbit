import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: { apiKey: { findUnique: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/lib/auth/rate-limit", () => ({ checkRateLimit: vi.fn() }));

import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { requireApiKey, generateApiKey, hashApiKey } from "@/lib/auth/api-key";

const db = prisma as unknown as {
  apiKey: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
};
const limiter = checkRateLimit as ReturnType<typeof vi.fn>;

const req = (token?: string) =>
  new NextRequest("http://localhost/api/v1/x", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: "k1",
    workspaceId: "ws-1",
    revokedAt: null,
    lastUsedAt: null,
    workspace: { tier: "free", deletedAt: null },
    ...overrides,
  };
}

describe("api keys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.apiKey.update.mockResolvedValue({});
    limiter.mockResolvedValue(null);
  });

  it("generates prefixed keys whose hash matches and which never collide", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key.startsWith("orb_")).toBe(true);
    expect(a.key.startsWith(a.prefix)).toBe(true);
    expect(a.keyHash).toBe(hashApiKey(a.key));
    expect(a.keyHash).not.toBe(b.keyHash);
  });

  it("looks up by hash with a single indexed query (no workspace scan)", async () => {
    db.apiKey.findUnique.mockResolvedValue(record());
    const { key } = generateApiKey();
    const auth = await requireApiKey(req(key));
    expect(auth).toEqual({ workspaceId: "ws-1" });
    expect(db.apiKey.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { keyHash: hashApiKey(key) } })
    );
  });

  it("rejects missing, unknown, revoked keys and deleted workspaces with 401", async () => {
    for (const rec of [
      null,
      record({ revokedAt: new Date() }),
      record({ workspace: { tier: "free", deletedAt: new Date() } }),
    ]) {
      db.apiKey.findUnique.mockResolvedValue(rec);
      const res = await requireApiKey(req("orb_whatever"));
      expect(res).toBeInstanceOf(NextResponse);
      expect((res as NextResponse).status).toBe(401);
    }
    const noHeader = await requireApiKey(req());
    expect((noHeader as NextResponse).status).toBe(401);
  });

  it("applies the workspace rate limit and returns its 429", async () => {
    db.apiKey.findUnique.mockResolvedValue(record());
    limiter.mockResolvedValue(NextResponse.json({}, { status: 429 }));
    const res = await requireApiKey(req("orb_x"));
    expect((res as NextResponse).status).toBe(429);
    expect(limiter).toHaveBeenCalledWith("ws-1", "free");
  });

  it("does not rate limit or touch lastUsedAt for invalid keys", async () => {
    db.apiKey.findUnique.mockResolvedValue(null);
    await requireApiKey(req("orb_bad"));
    expect(limiter).not.toHaveBeenCalled();
    expect(db.apiKey.update).not.toHaveBeenCalled();
  });

  it("throttles lastUsedAt writes", async () => {
    db.apiKey.findUnique.mockResolvedValue(record({ lastUsedAt: new Date() }));
    await requireApiKey(req("orb_x"));
    expect(db.apiKey.update).not.toHaveBeenCalled();

    db.apiKey.findUnique.mockResolvedValue(record({ lastUsedAt: new Date(Date.now() - 10 * 60_000) }));
    await requireApiKey(req("orb_x"));
    expect(db.apiKey.update).toHaveBeenCalledTimes(1);
  });
});
