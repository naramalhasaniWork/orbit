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
  it("a deleted workspace is rejected with WORKSPACE_DELETED", async () => {
    findUnique.mockResolvedValue({ id: "m1", role: "member", workspace: { deletedAt: new Date() } });
    await expect(getRbacContext("w1")).rejects.toMatchObject({ status: 403, code: "WORKSPACE_DELETED" });
    await expect(requireWorkspace()).rejects.toMatchObject({ status: 403, code: "WORKSPACE_DELETED" });
  });

  it("a live workspace is admitted", async () => {
    findUnique.mockResolvedValue({ id: "m1", role: "member", workspace: { deletedAt: null } });
    await expect(getRbacContext("w1")).resolves.toMatchObject({ role: "member" });
    await expect(requireWorkspace()).resolves.toMatchObject({ role: "member" });
  });

  it("denies when the membership lookup finds nothing (deleted workspace)", async () => {
    findUnique.mockResolvedValue(null);
    await expect(getRbacContext("w1")).rejects.toMatchObject({ status: 403 });
    await expect(requireWorkspace()).rejects.toMatchObject({ status: 403 });
  });
});
