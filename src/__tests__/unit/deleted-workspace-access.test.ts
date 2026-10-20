import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { workspaceMember: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => ({
    user: { id: "u1", email: "a@x.com" },
    workspaceId: "w1",
  })),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getRbacContext } from "@/lib/auth/rbac";
import { requireWorkspace } from "@/lib/utils/api";

beforeEach(() => findUnique.mockReset());

describe("soft-deleted workspaces admit nobody", () => {
  it("getRbacContext and requireWorkspace query only non-deleted workspaces", async () => {
    findUnique.mockResolvedValue({ id: "m1", role: "member", workspace: { deletedAt: null } });
    await getRbacContext("w1");
    await requireWorkspace();
    for (const call of findUnique.mock.calls) {
      expect(call[0].where.workspace).toEqual({ deletedAt: null });
    }
  });

  it("denies when the membership lookup finds nothing (deleted workspace)", async () => {
    findUnique.mockResolvedValue(null);
    await expect(getRbacContext("w1")).rejects.toMatchObject({ status: 403 });
    await expect(requireWorkspace()).rejects.toMatchObject({ status: 403 });
  });
});
