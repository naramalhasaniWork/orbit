import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// A small in-memory store standing in for the two tables that have ever held the token.
interface Row { workspaceId: string; provider: string; credentials: Record<string, string>; webhookTokenHash?: string | null }
const store = vi.hoisted(() => ({ previewConnections: [] as Row[], integrationConfigs: [] as Row[] }));

function deleteMany(table: Row[]) {
  return vi.fn(async ({ where }: { where: { workspaceId: string; provider: string } }) => {
    const before = table.length;
    const keep = table.filter((r) => !(r.workspaceId === where.workspaceId && r.provider === where.provider));
    table.splice(0, table.length, ...keep);
    return { count: before - keep.length };
  });
}

const upsertCheckRun = vi.hoisted(() => vi.fn());
vi.mock("@/services/reporting/integrations/github-checks", () => ({ upsertCheckRun, findOpenPullRequestsForCommit: vi.fn() }));
const pending = vi.hoisted(() => ({ rows: [] as Array<{ id: string; commitSha: string; checkRunId: string }> }));

vi.mock("@/lib/db", () => {
  const prisma = {
    previewBinding: { findMany: vi.fn(async () => [{ id: "b1", projectId: "p1" }]) },
    previewDeployment: {
      findMany: vi.fn(async () => pending.rows),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    previewConnection: { deleteMany: deleteMany(store.previewConnections) },
    integrationConfig: { deleteMany: deleteMany(store.integrationConfigs) },
    $transaction: (ops: Array<Promise<unknown>>) => Promise.all(ops),
  };
  return { prisma };
});
vi.mock("@/lib/auth/rbac", () => ({ requirePermission: vi.fn(async () => ({})) }));
vi.mock("@/lib/utils/api", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireWorkspace: vi.fn(async () => ({ workspaceId: "ws-1" })),
    apiSuccess: (data: unknown) => NextResponse.json({ success: true, data }),
    apiError: (message: string, code: string, status = 400) => NextResponse.json({ error: { message, code } }, { status }),
    handleApiError: () => NextResponse.json({}, { status: 500 }),
  };
});

import { DELETE } from "@/app/api/integrations/[provider]/route";

const hasToken = (rows: Row[], workspaceId: string, provider: string) =>
  rows.some((r) => r.workspaceId === workspaceId && r.provider === provider && (r.credentials.encryptedToken || r.webhookTokenHash));

describe("DELETE /api/integrations/[provider]", () => {
  beforeEach(() => {
    store.previewConnections.splice(0, Infinity,
      { workspaceId: "ws-1", provider: "railway", credentials: { encryptedToken: "enc", iv: "iv" }, webhookTokenHash: "h" },
      { workspaceId: "ws-2", provider: "railway", credentials: { encryptedToken: "other", iv: "iv" } });
    store.integrationConfigs.splice(0, Infinity,
      { workspaceId: "ws-1", provider: "railway", credentials: { encryptedToken: "legacy", iv: "iv" } },
      { workspaceId: "ws-1", provider: "slack", credentials: { encryptedToken: "slack", iv: "iv" } });
  });

  it("leaves no encrypted token or webhook token for that workspace and provider", async () => {
    const res = await DELETE(new NextRequest("http://x/api/integrations/railway", { method: "DELETE" }), {
      params: Promise.resolve({ provider: "railway" }),
    });

    expect(res.status).toBe(200);
    expect(hasToken(store.previewConnections, "ws-1", "railway")).toBe(false);
    expect(hasToken(store.integrationConfigs, "ws-1", "railway")).toBe(false);
    // Other workspaces and other integrations are untouched.
    expect(hasToken(store.previewConnections, "ws-2", "railway")).toBe(true);
    expect(hasToken(store.integrationConfigs, "ws-1", "slack")).toBe(true);
  });

  it("completes in-progress 'Orbit preview' checks as neutral before the rows cascade away", async () => {
    pending.rows = [{ id: "pd1", commitSha: "abc", checkRunId: "check-1" }];
    await DELETE(new NextRequest("http://x/api/integrations/railway", { method: "DELETE" }), {
      params: Promise.resolve({ provider: "railway" }),
    });
    expect(upsertCheckRun).toHaveBeenCalledWith("p1", expect.objectContaining({
      name: "Orbit preview", checkRunId: "check-1", status: "completed", conclusion: "neutral",
    }));
    pending.rows = [];
  });

  it("does not touch IntegrationConfig rows when disconnecting Cloudflare", async () => {
    store.previewConnections.push({ workspaceId: "ws-1", provider: "cloudflare_pages", credentials: { encryptedToken: "cf", iv: "iv" } });
    await DELETE(new NextRequest("http://x/api/integrations/cloudflare_pages", { method: "DELETE" }), {
      params: Promise.resolve({ provider: "cloudflare_pages" }),
    });
    expect(hasToken(store.previewConnections, "ws-1", "cloudflare_pages")).toBe(false);
    expect(store.integrationConfigs).toHaveLength(2);
  });
});
