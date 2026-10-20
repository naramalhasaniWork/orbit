import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const findMany = vi.fn(async () => [
  {
    id: "w1", name: "A", slug: "a", tier: "free", creditBalance: 1, deletedAt: null, createdAt: new Date(),
    _count: { members: 2, projects: 0 },
    members: [{ user: { name: "Olive Owner", email: "o@x.com" } }],
  },
]);

vi.mock("@/lib/db", () => ({
  prisma: { workspace: { findMany: (...a: unknown[]) => findMany(...(a as [])), count: vi.fn(async () => 1) } },
}));
vi.mock("@/lib/utils/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/utils/api")>()),
  requireSuperAdmin: vi.fn(async () => ({ user: { id: "sa" } })),
}));

describe("GET /api/admin/workspaces", () => {
  it("resolves the owner column from the owner role, not the first admin", async () => {
    const { GET } = await import("@/app/api/admin/workspaces/route");
    const res = await GET(new NextRequest("http://localhost/api/admin/workspaces"));
    const { data } = await res.json();
    expect(data.workspaces[0].owner.email).toBe("o@x.com");
    const args = findMany.mock.calls[0] as unknown as [{ include: { members: { where: { role: string } } } }];
    expect(args[0].include.members.where.role).toBe("owner");
  });
});
