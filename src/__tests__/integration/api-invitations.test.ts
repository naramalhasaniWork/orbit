import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { resetRouteAuth } from "../helpers/route-auth";

type Row = Record<string, unknown>;
let invites: Row[];
let members: Array<{ user: { email: string | null } }>;
const canConsume = vi.fn();
const sendInvite = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    workspaceMember: { findMany: vi.fn(async () => members) },
    workspaceInvitation: {
      findMany: vi.fn(async ({ where }: { where: Row }) =>
        invites.filter((i) => i.email === where.email && i.status === "pending")
      ),
      findFirst: vi.fn(async ({ where }: { where: Row }) =>
        invites.find(
          (i) => i.id === where.id && (where.status as { in: string[] }).in.includes(i.status as string)
        ) ?? null
      ),
      updateMany: vi.fn(async ({ where, data }: { where: { id: { in: string[] } }; data: Row }) => {
        invites.filter((i) => where.id.in.includes(i.id as string)).forEach((i) => Object.assign(i, data));
      }),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = { id: `inv${invites.length + 1}`, status: "pending", ...data };
        invites.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = invites.find((i) => i.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
  },
}));
vi.mock("@/lib/auth/rbac", () => ({ assertCanManageRole: vi.fn() }));
vi.mock("@/server/http/session", async () => (await import("../helpers/route-auth")).sessionMock());
vi.mock("@/server/http/auth", async (orig) =>
  (await import("../helpers/route-auth")).authMock(await orig<Record<string, unknown>>())
);
vi.mock("@/lib/auth/tenant", async () => {
  const { prisma } = await import("@/lib/db");
  return {
    // Seat check then insert, like the real one minus the row lock (covered in seat-reservation.test)
    withSeatReserved: async (workspaceId: string, take: (tx: unknown) => Promise<unknown>) => {
      const decision = await canConsume(workspaceId, "member");
      return decision.allowed ? { ok: true, value: await take(prisma) } : { ok: false, decision };
    },
  };
});
vi.mock("@/lib/auth/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/email/invite-email", () => ({
  deliverInviteEmail: (...a: unknown[]) => sendInvite(...a),
}));

const params = { params: Promise.resolve({ workspaceId: "w1" }) };
const post = (body: unknown) =>
  new NextRequest("http://localhost/x", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  resetRouteAuth();
  invites = [];
  members = [];
  canConsume.mockResolvedValue({ allowed: true });
  sendInvite.mockResolvedValue({ sent: true });
});

describe("POST invitations", () => {
  it("lowercases the email, emails the invite and reports emailSent", async () => {
    const { POST } = await import("@/app/api/workspaces/[workspaceId]/invitations/route");
    const res = await POST(post({ email: "  New@Example.COM ", role: "member" }), params);
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.email).toBe("new@example.com");
    expect(data.emailSent).toBe(true);
    expect(sendInvite).toHaveBeenCalledTimes(1);
  });

  it("reports emailSent false when no provider is configured", async () => {
    sendInvite.mockResolvedValue({ sent: false, reason: "not_configured" });
    const { POST } = await import("@/app/api/workspaces/[workspaceId]/invitations/route");
    const { data } = await (await POST(post({ email: "a@x.com" }), params)).json();
    expect(data.emailSent).toBe(false);
    expect(data.token).toBeTruthy();
  });

  it("detects an existing member regardless of case, but not a wildcard lookalike", async () => {
    const { POST } = await import("@/app/api/workspaces/[workspaceId]/invitations/route");
    members = [{ user: { email: "Pat@Example.com" } }];
    expect((await POST(post({ email: "pat@example.com" }), params)).status).toBe(409);

    members = [{ user: { email: "paXt@example.com" } }];
    expect((await POST(post({ email: "pa_t@example.com" }), params)).status).toBe(201);
  });

  it("blocks a live duplicate but replaces an expired pending invite", async () => {
    const { POST } = await import("@/app/api/workspaces/[workspaceId]/invitations/route");
    invites = [
      { id: "old", email: "a@x.com", status: "pending", expiresAt: new Date(Date.now() + 86_400_000) },
    ];
    expect((await POST(post({ email: "A@x.com" }), params)).status).toBe(409);

    invites = [
      { id: "old", email: "a@x.com", status: "pending", expiresAt: new Date(Date.now() - 1000) },
    ];
    expect((await POST(post({ email: "a@x.com" }), params)).status).toBe(201);
    expect(invites.find((i) => i.id === "old")?.status).toBe("expired");
    expect(invites.filter((i) => i.status === "pending")).toHaveLength(1);
  });
});

describe("POST resend", () => {
  const rParams = { params: Promise.resolve({ workspaceId: "w1", invitationId: "inv1" }) };

  it("rotates the token, extends expiry, revives expired invites and re-sends", async () => {
    invites = [
      { id: "inv1", email: "a@x.com", role: "member", token: "old", status: "expired", expiresAt: new Date(Date.now() - 1000) },
    ];
    const { POST } = await import(
      "@/app/api/workspaces/[workspaceId]/invitations/[invitationId]/resend/route"
    );
    const res = await POST(post({}), rParams);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.token).not.toBe("old");
    expect(invites[0].status).toBe("pending");
    expect((invites[0].expiresAt as Date).getTime()).toBeGreaterThan(Date.now());
    expect(sendInvite).toHaveBeenCalledTimes(1);
    expect(canConsume).toHaveBeenCalledWith("w1", "member");
  });

  it("refuses to revive an expired invite when seats are full, and 404s accepted ones", async () => {
    canConsume.mockResolvedValue({ allowed: false, reason: "full", code: "LIMIT_REACHED" });
    invites = [{ id: "inv1", email: "a@x.com", status: "expired", expiresAt: new Date(0) }];
    const { POST } = await import(
      "@/app/api/workspaces/[workspaceId]/invitations/[invitationId]/resend/route"
    );
    expect((await POST(post({}), rParams)).status).toBe(403);

    invites = [{ id: "inv1", email: "a@x.com", status: "accepted", expiresAt: new Date(0) }];
    expect((await POST(post({}), rParams)).status).toBe(404);
  });

  it("applies the inviter's role ceiling before re-issuing the token", async () => {
    const { assertCanManageRole } = await import("@/lib/auth/rbac");
    vi.mocked(assertCanManageRole).mockImplementationOnce(() => {
      throw Object.assign(new Error("Cannot manage a role at or above your own"), { status: 403 });
    });
    invites = [
      { id: "inv1", email: "a@x.com", role: "admin", token: "old", status: "pending", expiresAt: new Date(Date.now() + 1000) },
    ];
    const { POST } = await import(
      "@/app/api/workspaces/[workspaceId]/invitations/[invitationId]/resend/route"
    );
    const res = await POST(post({}), rParams);
    expect(res.status).not.toBe(200);
    expect(assertCanManageRole).toHaveBeenCalledWith("owner", "admin");
    expect(invites[0].token).toBe("old");
    expect(sendInvite).not.toHaveBeenCalled();
  });
});
