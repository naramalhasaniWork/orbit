import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const roleRef = vi.hoisted(() => ({ role: "owner" }));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => ({ user: { id: "user-1" }, workspaceId: "ws-1" })),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    workspaceMember: {
      findUnique: vi.fn(async () => ({ id: "m1", role: roleRef.role })),
    },
    apiKey: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { GET, POST } from "@/app/api/workspaces/[workspaceId]/api-keys/route";
import { DELETE } from "@/app/api/workspaces/[workspaceId]/api-keys/[keyId]/route";

const db = prisma as unknown as {
  apiKey: Record<"findMany" | "findFirst" | "count" | "create" | "update", ReturnType<typeof vi.fn>>;
};
const ctx = { params: Promise.resolve({ workspaceId: "ws-1", keyId: "k1" }) };
const post = (body: unknown) =>
  new NextRequest("http://localhost/api/workspaces/ws-1/api-keys", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("workspace api-keys routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    roleRef.role = "owner";
    db.apiKey.count.mockResolvedValue(0);
    db.apiKey.create.mockImplementation(async ({ data }) => ({
      id: "k1",
      name: data.name,
      prefix: data.prefix,
      lastUsedAt: null,
      createdAt: new Date(),
    }));
  });

  it("creates a key, returns the plaintext once, and stores only the hash", async () => {
    const res = await POST(post({ name: "CI" }), ctx);
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.key).toMatch(/^orb_/);
    expect(data.apiKey.prefix).toBe(data.key.slice(0, 12));
    expect(JSON.stringify(data.apiKey)).not.toContain(data.key);

    const stored = db.apiKey.create.mock.calls[0][0].data;
    expect(stored.keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(data.key);
    expect(stored.createdBy).toBe("user-1");
  });

  it("lists keys without exposing hashes", async () => {
    db.apiKey.findMany.mockResolvedValue([]);
    await GET(new NextRequest("http://localhost/x"), ctx);
    const args = db.apiKey.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ workspaceId: "ws-1", revokedAt: null });
    expect(args.select.keyHash).toBeUndefined();
  });

  it("validates the name", async () => {
    expect((await POST(post({ name: "  " }), ctx)).status).toBe(400);
  });

  it("revokes (soft) a key in this workspace", async () => {
    db.apiKey.findFirst.mockResolvedValue({ id: "k1", name: "CI", prefix: "orb_abc" });
    const res = await DELETE(new NextRequest("http://localhost/x", { method: "DELETE" }), ctx);
    expect(res.status).toBe(200);
    expect(db.apiKey.update.mock.calls[0][0].data.revokedAt).toBeInstanceOf(Date);
  });

  it("404s when revoking a key from another workspace", async () => {
    db.apiKey.findFirst.mockResolvedValue(null);
    const res = await DELETE(new NextRequest("http://localhost/x", { method: "DELETE" }), ctx);
    expect(res.status).toBe(404);
    expect(db.apiKey.update).not.toHaveBeenCalled();
  });

  it.each(["viewer", "member", "billing"])("denies %s role on every route", async (role) => {
    roleRef.role = role;
    expect((await GET(new NextRequest("http://localhost/x"), ctx)).status).toBe(403);
    expect((await POST(post({ name: "x" }), ctx)).status).toBe(403);
    expect((await DELETE(new NextRequest("http://localhost/x", { method: "DELETE" }), ctx)).status).toBe(403);
    expect(db.apiKey.create).not.toHaveBeenCalled();
  });
});
