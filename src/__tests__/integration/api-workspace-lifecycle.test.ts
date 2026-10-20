import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { existsSync } from "fs";
import { join } from "path";
import { resetRouteAuth, routeAuth } from "../helpers/route-auth";

let workspace: Record<string, unknown> | null;
let ownerCount: number;
const audit = vi.fn();
const wsCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    workspace: {
      findFirst: vi.fn(async () => workspace),
      findUnique: vi.fn(async ({ where }: { where: { slug?: string } }) =>
        where.slug === "taken" ? { id: "other" } : null
      ),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "w1",
        name: "Acme",
        slug: "acme",
        ...data,
      })),
      create: (...a: unknown[]) => wsCreate(...a),
    },
    workspaceMember: {
      count: vi.fn(async () => ownerCount),
      delete: vi.fn(async () => ({})),
    },
  },
}));
vi.mock("@/server/http/session", async () => (await import("../helpers/route-auth")).sessionMock());
vi.mock("@/server/http/auth", async (orig) =>
  (await import("../helpers/route-auth")).authMock(await orig<Record<string, unknown>>())
);
vi.mock("@/lib/auth/audit", () => ({ writeAuditLog: (...a: unknown[]) => audit(...a) }));
vi.mock("@/lib/utils/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/utils/api")>()),
  requireAuth: vi.fn(async () => ({ user: { id: "u1" } })),
}));

const params = { params: Promise.resolve({ workspaceId: "w1" }) };
const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/x", { method, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  resetRouteAuth();
  workspace = { id: "w1", name: "Acme", slug: "acme", stripeSubscriptionId: null };
  ownerCount = 1;
});

describe("PATCH /api/workspaces/[id]", () => {
  it("renames, audits, and rejects taken or malformed slugs", async () => {
    const { PATCH } = await import("@/app/api/workspaces/[workspaceId]/route");
    const ok = await PATCH(req("PATCH", { name: "New Name", slug: "new-name" }), params);
    expect(ok.status).toBe(200);
    routeAuth.role = "viewer";
    expect((await PATCH(req("PATCH", { name: "Nope" }), params)).status).toBe(403);
    routeAuth.role = "owner";
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "workspace.settings_updated" }));

    expect((await PATCH(req("PATCH", { slug: "taken" }), params)).status).toBe(409);
    expect((await PATCH(req("PATCH", { slug: "Bad Slug!" }), params)).status).toBe(400);
    expect((await PATCH(req("PATCH", {}), params)).status).toBe(400);
  });

  it("maps a unique-constraint race to 409", async () => {
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.workspace.update).mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    const { PATCH } = await import("@/app/api/workspaces/[workspaceId]/route");
    expect((await PATCH(req("PATCH", { slug: "racey" }), params)).status).toBe(409);
  });
});

describe("DELETE /api/workspaces/[id]", () => {
  it("soft deletes for the owner with the exact name and audits it", async () => {
    const { DELETE } = await import("@/app/api/workspaces/[workspaceId]/route");
    const { prisma } = await import("@/lib/db");

    expect((await DELETE(req("DELETE", { confirmName: "acme" }), params)).status).toBe(400);
    expect((await DELETE(req("DELETE", { confirmName: "Acme" }), params)).status).toBe(200);
    const data = vi.mocked(prisma.workspace.update).mock.calls[0][0].data as { deletedAt: Date };
    expect(data.deletedAt).toBeInstanceOf(Date);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "workspace.deleted" }));
  });

  it("is owner only and refuses while a subscription is active", async () => {
    const { DELETE } = await import("@/app/api/workspaces/[workspaceId]/route");
    routeAuth.role = "admin";
    expect((await DELETE(req("DELETE", { confirmName: "Acme" }), params)).status).toBe(403);

    routeAuth.role = "owner";
    workspace = { ...workspace, stripeSubscriptionId: "sub_1" };
    expect((await DELETE(req("DELETE", { confirmName: "Acme" }), params)).status).toBe(409);
  });

  it("404s an already deleted workspace", async () => {
    workspace = null;
    const { DELETE } = await import("@/app/api/workspaces/[workspaceId]/route");
    expect((await DELETE(req("DELETE", { confirmName: "Acme" }), params)).status).toBe(404);
  });
});

describe("POST /api/workspaces/[id]/leave", () => {
  it("lets a member leave and audits it", async () => {
    routeAuth.role = "member";
    const { POST } = await import("@/app/api/workspaces/[workspaceId]/leave/route");
    expect((await POST(req("POST"), params)).status).toBe(200);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "member.left" }));
  });

  it("blocks the sole owner but allows one of several owners", async () => {
    const { POST } = await import("@/app/api/workspaces/[workspaceId]/leave/route");
    expect((await POST(req("POST"), params)).status).toBe(409);
    ownerCount = 2;
    expect((await POST(req("POST"), params)).status).toBe(200);
  });
});

describe("POST /api/workspaces", () => {
  it("creates workspace and owner membership in one statement, retrying slug collisions", async () => {
    wsCreate
      .mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }))
      .mockResolvedValueOnce({ id: "new" });
    const { POST } = await import("@/app/api/workspaces/route");
    const res = await POST(req("POST", { name: "Fresh" }));
    expect(res.status).toBe(201);
    expect(wsCreate).toHaveBeenCalledTimes(2);
    expect(wsCreate.mock.calls[1][0].data.members).toEqual({ create: { userId: "u1", role: "owner" } });
    expect(wsCreate.mock.calls[0][0].data.slug).not.toBe(wsCreate.mock.calls[1][0].data.slug);
  });

  it("gives up after repeated collisions", async () => {
    wsCreate.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("@/app/api/workspaces/route");
    expect((await POST(req("POST", { name: "Fresh" }))).status).toBe(500);
    expect(wsCreate).toHaveBeenCalledTimes(5);
  });
});

describe("admin", () => {
  it("has no impersonation route", () => {
    expect(existsSync(join(process.cwd(), "src/app/api/admin/impersonate/route.ts"))).toBe(false);
  });
});
