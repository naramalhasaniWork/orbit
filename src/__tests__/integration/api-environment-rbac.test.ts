import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const role = vi.hoisted(() => ({ current: "member" }));
const runControl = vi.hoisted(() => ({ cancelRun: vi.fn(async () => true) }));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => ({ user: { id: "user-1" }, workspaceId: "ws-1" })),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/services/orchestrator/run-manager", () => runControl);
vi.mock("@/lib/db", () => ({
  prisma: {
    workspaceMember: { findUnique: vi.fn(async () => ({ id: "m1", role: role.current, workspace: { deletedAt: null } })) },
    project: { findFirst: vi.fn(async () => ({ id: "p1" })) },
    environment: {
      findFirst: vi.fn(async () => ({ id: "e1", url: "https://staging.example.com" })),
      update: vi.fn(async (a: { data: unknown }) => a.data),
      updateMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { PATCH, POST } from "@/app/api/projects/[projectId]/environments/route";
import { PATCH as patchRun } from "@/app/api/projects/[projectId]/runs/[runId]/route";
import { DELETE } from "@/app/api/projects/[projectId]/environments/[envId]/route";

const env = (prisma as unknown as {
  environment: Record<"update" | "create" | "delete", ReturnType<typeof vi.fn>>;
}).environment;
const ctx = { params: Promise.resolve({ projectId: "p1", envId: "e1", runId: "r1" }) };
const send = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/x", { method, body: body ? JSON.stringify(body) : undefined });

beforeEach(() => {
  vi.clearAllMocks();
  role.current = "member";
});

describe("environment changes that redirect secrets need secrets.manage", () => {
  it("member cannot delete an environment (cascades to secrets)", async () => {
    expect((await DELETE(send("DELETE"), ctx)).status).toBe(403);
    expect(env.delete).not.toHaveBeenCalled();
  });

  it("admin can delete an environment", async () => {
    role.current = "admin";
    expect((await DELETE(send("DELETE"), ctx)).status).toBe(200);
  });

  it("member cannot re-point an environment URL", async () => {
    const res = await PATCH(send("PATCH", { id: "e1", url: "https://attacker.example.net" }), ctx);
    expect(res.status).toBe(403);
    expect(env.update).not.toHaveBeenCalled();
  });

  it("member can still rename an environment or resend the unchanged URL", async () => {
    expect((await PATCH(send("PATCH", { id: "e1", name: "QA" }), ctx)).status).toBe(200);
    expect(
      (await PATCH(send("PATCH", { id: "e1", url: "https://staging.example.com" }), ctx)).status
    ).toBe(200);
  });

  it("admin can change the URL", async () => {
    role.current = "admin";
    expect((await PATCH(send("PATCH", { id: "e1", url: "https://new.example.com" }), ctx)).status).toBe(200);
  });

  it("member cannot create an environment (url and teardownHookUrl are attacker-chosen)", async () => {
    const res = await POST(
      send("POST", { name: "x", url: "https://attacker.example.net", teardownHookUrl: "https://attacker.example.net/hook" }),
      ctx
    );
    expect(res.status).toBe(403);
    expect(env.create).not.toHaveBeenCalled();
  });
});

describe("cancelling a run via PATCH uses runs.cancel like the dedicated endpoint", () => {
  it("member cannot cancel", async () => {
    const res = await patchRun(send("PATCH", { status: "cancelled" }), ctx);
    expect(res.status).toBe(403);
    expect(runControl.cancelRun).not.toHaveBeenCalled();
  });

  it("admin can cancel", async () => {
    role.current = "admin";
    const res = await patchRun(send("PATCH", { status: "cancelled" }), ctx);
    expect(res.status).toBe(200);
    expect(runControl.cancelRun).toHaveBeenCalledWith("r1");
  });
});
