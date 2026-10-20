import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ membership: { role: "owner" } as { role: string } | null, actorRole: "admin" }));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => ({
    user: { id: "user-1" },
    workspaceId: "ws-1",
    role: "owner", // stale JWT claim: must be ignored
  })),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    workspaceMember: {
      findUnique: vi.fn(async () => (state.membership ? { id: "m-actor", role: state.membership.role } : null)),
      findFirst: vi.fn(async () => ({ id: "m-target", userId: "u2", role: "member" })),
      update: vi.fn(),
    },
    workspaceInvitation: { findFirst: vi.fn(), create: vi.fn() },
    workspace: { findUnique: vi.fn() },
    gitHubInstallation: { deleteMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { requireWorkspace } from "@/lib/utils/api";
import { PATCH } from "@/app/api/workspaces/[workspaceId]/members/route";
import { POST as invite } from "@/app/api/workspaces/[workspaceId]/invitations/route";
import { DELETE as disconnectGitHub } from "@/app/api/workspaces/[workspaceId]/integrations/github/route";

const db = prisma as unknown as {
  workspaceMember: { update: ReturnType<typeof vi.fn> };
  workspaceInvitation: { create: ReturnType<typeof vi.fn> };
  gitHubInstallation: { deleteMany: ReturnType<typeof vi.fn> };
};
const ctx = { params: Promise.resolve({ workspaceId: "ws-1" }) };
const MEMBER_ID = "11111111-1111-4111-8111-111111111111";
const req = (body: unknown, method = "PATCH") =>
  new NextRequest("http://localhost/x", { method, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  state.membership = { role: "admin" };
});

describe("requireWorkspace", () => {
  it("rejects a user who is no longer a member, despite a valid JWT", async () => {
    state.membership = null;
    await expect(requireWorkspace()).rejects.toMatchObject({ status: 403 });
  });

  it("uses the role from the database, not the JWT", async () => {
    const result = await requireWorkspace();
    expect(result.role).toBe("admin");
    expect(result.session.role).toBe("admin");
  });
});

describe("role escalation", () => {
  it("an admin cannot promote a member to admin", async () => {
    const res = await PATCH(req({ memberId: MEMBER_ID, role: "admin" }), ctx);
    expect(res.status).toBe(403);
    expect(db.workspaceMember.update).not.toHaveBeenCalled();
  });

  it("an admin can still set lower roles", async () => {
    const res = await PATCH(req({ memberId: MEMBER_ID, role: "viewer" }), ctx);
    expect(res.status).toBe(200);
    expect(db.workspaceMember.update).toHaveBeenCalled();
  });

  it("an owner can promote to admin", async () => {
    state.membership = { role: "owner" };
    const res = await PATCH(req({ memberId: MEMBER_ID, role: "admin" }), ctx);
    expect(res.status).toBe(200);
  });

  it("an admin cannot invite another admin", async () => {
    const res = await invite(req({ email: "a@b.com", role: "admin" }, "POST"), ctx);
    expect(res.status).toBe(403);
    expect(db.workspaceInvitation.create).not.toHaveBeenCalled();
  });
});

describe("workspace GitHub disconnect", () => {
  it("requires integrations.manage", async () => {
    state.membership = { role: "member" };
    const res = await disconnectGitHub(new NextRequest("http://localhost/x", { method: "DELETE" }), ctx);
    expect(res.status).toBe(403);
    expect(db.gitHubInstallation.deleteMany).not.toHaveBeenCalled();
  });
});
