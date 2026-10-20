import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { dropTenant, realDbUrl, seedTenant, useRealDb, type TenantFixture } from "../helpers/real-db";

/**
 * Every migrated id-param route, called by workspace B's owner with workspace A's ids, answers
 * 404 and leaves A's rows alone. Real Postgres, real route(), real membership read: only the
 * NextAuth session and the side-effect services are stubbed.
 */
useRealDb();

const caller = vi.hoisted(() => ({ userId: "", workspaceId: "" }));
const sideEffects = vi.hoisted(() => ({
  cancelRun: vi.fn(), emitRunProgress: vi.fn(), getTraceTree: vi.fn(), download: vi.fn(),
  getBindingView: vi.fn(), saveBinding: vi.fn(), deleteBinding: vi.fn(), loadAccessSecrets: vi.fn(),
  syncEnvironments: vi.fn(), probeAccess: vi.fn(), findLatestLiveScript: vi.fn(), safeFetch: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => ({ user: { id: caller.userId }, workspaceId: caller.workspaceId })),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/api-key", () => ({ requireApiKey: vi.fn(async () => ({ workspaceId: caller.workspaceId })) }));
vi.mock("@/services/orchestrator/run-manager", () => ({ cancelRun: sideEffects.cancelRun }));
vi.mock("@/lib/websocket", () => ({ emitRunProgress: sideEffects.emitRunProgress }));
vi.mock("@/services/tracing", () => ({ getTraceTree: sideEffects.getTraceTree }));
vi.mock("@/lib/storage", () => ({ getStorage: () => ({ download: sideEffects.download }) }));
vi.mock("@/services/preview/binding-service", () => ({
  getBindingView: sideEffects.getBindingView, saveBinding: sideEffects.saveBinding,
  deleteBinding: sideEffects.deleteBinding, loadAccessSecrets: sideEffects.loadAccessSecrets,
}));
vi.mock("@/services/preview/connection-service", () => ({ listConnectionSummaries: vi.fn(async () => []) }));
vi.mock("@/services/integrations/railway/environment-sync", () => ({ syncEnvironments: sideEffects.syncEnvironments }));
vi.mock("@/services/execution/access-headers", () => ({ probeAccess: sideEffects.probeAccess }));
vi.mock("@/server/engine/replay/script-store", () => ({ findLatestLiveScript: sideEffects.findLatestLiveScript }));
vi.mock("@/lib/utils/ssrf", async (orig) => ({ ...(await orig<Record<string, unknown>>()), safeFetch: sideEffects.safeFetch }));

type Handler = (req: Request, segment: { params: Promise<Record<string, string>> }) => Promise<Response>;
interface Case {
  name: string;
  load: () => Promise<Record<string, unknown>>;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Path params given workspace A's fixture and the project id to address. */
  params: (a: TenantFixture, projectId: string) => Record<string, string>;
  body?: unknown;
  /** false: the route has no child id, so only the foreign-project probe applies. */
  childProbe?: boolean;
}

const R = "@/app/api/projects/[projectId]";
const CASES: Case[] = [
  { name: "GET runs/[runId]", load: () => import(`${R}/runs/[runId]/route`), method: "GET", params: (a, p) => ({ projectId: p, runId: a.runId }) },
  { name: "PATCH runs/[runId]", load: () => import(`${R}/runs/[runId]/route`), method: "PATCH", body: { status: "cancelled" }, params: (a, p) => ({ projectId: p, runId: a.runId }) },
  { name: "POST runs/[runId]/cancel", load: () => import(`${R}/runs/[runId]/cancel/route`), method: "POST", params: (a, p) => ({ projectId: p, runId: a.runId }) },
  { name: "GET runs/[runId]/traces", load: () => import(`${R}/runs/[runId]/traces/route`), method: "GET", params: (a, p) => ({ projectId: p, runId: a.runId }) },
  { name: "GET runs/[runId]/artifacts", load: () => import(`${R}/runs/[runId]/artifacts/route`), method: "GET", childProbe: false, params: (a, p) => ({ projectId: p, runId: a.runId }) },
  { name: "GET runs/[runId]/artifacts/[artifactId]/file", load: () => import(`${R}/runs/[runId]/artifacts/[artifactId]/file/route`), method: "GET", params: (a, p) => ({ projectId: p, runId: a.runId, artifactId: a.artifactId }) },
  { name: "GET runs/[runId]/screenshots", load: () => import(`${R}/runs/[runId]/screenshots/route`), method: "GET", params: (a, p) => ({ projectId: p, runId: a.runId }) },
  { name: "GET runs/[runId]/progress", load: () => import(`${R}/runs/[runId]/progress/route`), method: "GET", params: (a, p) => ({ projectId: p, runId: a.runId }) },
  { name: "GET test-cases/[testCaseId]", load: () => import(`${R}/test-cases/[testCaseId]/route`), method: "GET", params: (a, p) => ({ projectId: p, testCaseId: a.testCaseId }) },
  { name: "PATCH test-cases/[testCaseId]", load: () => import(`${R}/test-cases/[testCaseId]/route`), method: "PATCH", body: { name: "pwned" }, params: (a, p) => ({ projectId: p, testCaseId: a.testCaseId }) },
  { name: "DELETE test-cases/[testCaseId]", load: () => import(`${R}/test-cases/[testCaseId]/route`), method: "DELETE", params: (a, p) => ({ projectId: p, testCaseId: a.testCaseId }) },
  { name: "GET test-cases/[testCaseId]/script.spec.ts", load: () => import(`${R}/test-cases/[testCaseId]/script.spec.ts/route`), method: "GET", params: (a, p) => ({ projectId: p, testCaseId: a.testCaseId }) },
  { name: "GET environments/[envId]", load: () => import(`${R}/environments/[envId]/route`), method: "GET", params: (a, p) => ({ projectId: p, envId: a.environmentId }) },
  { name: "DELETE environments/[envId]", load: () => import(`${R}/environments/[envId]/route`), method: "DELETE", params: (a, p) => ({ projectId: p, envId: a.environmentId }) },
  { name: "DELETE secrets/[secretId]", load: () => import(`${R}/secrets/[secretId]/route`), method: "DELETE", params: (a, p) => ({ projectId: p, secretId: a.secretId }) },
  { name: "PATCH webhooks/[webhookId]", load: () => import(`${R}/webhooks/[webhookId]/route`), method: "PATCH", body: { isEnabled: false }, params: (a, p) => ({ projectId: p, webhookId: a.webhookId }) },
  { name: "DELETE webhooks/[webhookId]", load: () => import(`${R}/webhooks/[webhookId]/route`), method: "DELETE", params: (a, p) => ({ projectId: p, webhookId: a.webhookId }) },
  { name: "GET webhook-deliveries", load: () => import(`${R}/webhook-deliveries/route`), method: "GET", childProbe: false, params: (_a, p) => ({ projectId: p }) },
  { name: "POST webhook-deliveries/[deliveryId]/retry", load: () => import(`${R}/webhook-deliveries/[deliveryId]/retry/route`), method: "POST", params: (a, p) => ({ projectId: p, deliveryId: a.deliveryId }) },
  { name: "GET preview-binding", load: () => import(`${R}/preview-binding/route`), method: "GET", childProbe: false, params: (_a, p) => ({ projectId: p }) },
  { name: "PUT preview-binding", load: () => import(`${R}/preview-binding/route`), method: "PUT", childProbe: false, body: { provider: "railway", targetRef: "x" }, params: (_a, p) => ({ projectId: p }) },
  { name: "DELETE preview-binding", load: () => import(`${R}/preview-binding/route`), method: "DELETE", childProbe: false, params: (_a, p) => ({ projectId: p }) },
  { name: "POST preview-binding/import-environments", load: () => import(`${R}/preview-binding/import-environments/route`), method: "POST", childProbe: false, params: (_a, p) => ({ projectId: p }) },
  { name: "POST preview-binding/test-access", load: () => import(`${R}/preview-binding/test-access/route`), method: "POST", childProbe: false, body: { url: "https://x.pages.dev" }, params: (_a, p) => ({ projectId: p }) },
  { name: "GET v1/projects/[projectId]/runs/[runId]", load: () => import("@/app/api/v1/projects/[projectId]/runs/[runId]/route"), method: "GET", params: (a, p) => ({ projectId: p, runId: a.runId }) },
];

describe.skipIf(!realDbUrl)("tenant isolation of id-param routes (real Postgres)", () => {
  let db: typeof import("@/lib/db").prisma;
  let a: TenantFixture;
  let b: TenantFixture;

  async function call(c: Case, params: Record<string, string>): Promise<Response> {
    const handler = (await c.load())[c.method] as Handler;
    const req = new NextRequest(`http://localhost/api/x`, {
      method: c.method,
      headers: { authorization: "Bearer orb_test" },
      body: c.body === undefined ? undefined : JSON.stringify(c.body),
    });
    return handler(req, { params: Promise.resolve(params) });
  }

  async function snapshotOfA() {
    return {
      run: await db.testRun.findUnique({ where: { id: a.runId }, select: { status: true } }),
      testCase: await db.testCase.findUnique({ where: { id: a.testCaseId }, select: { name: true } }),
      environment: await db.environment.count({ where: { id: a.environmentId } }),
      secret: await db.secret.count({ where: { id: a.secretId } }),
      webhook: await db.webhookEndpoint.findUnique({ where: { id: a.webhookId }, select: { isEnabled: true } }),
      delivery: await db.webhookDelivery.findUnique({ where: { id: a.deliveryId }, select: { attempts: true } }),
    };
  }

  beforeAll(async () => {
    db = (await import("@/lib/db")).prisma;
    a = await seedTenant(db, "iso-a");
    b = await seedTenant(db, "iso-b");
    Object.assign(caller, { userId: b.userId, workspaceId: b.workspaceId });
  });

  afterAll(async () => {
    await dropTenant(db, a);
    await dropTenant(db, b);
  });

  it.each(CASES.map((c) => [c.name, c] as const))("%s: workspace A's project is 404 for workspace B", async (_name, c) => {
    const before = await snapshotOfA();
    const res = await call(c, c.params(a, a.projectId));
    expect(res.status).toBe(404);
    expect(await snapshotOfA()).toEqual(before);
  });

  it.each(CASES.filter((c) => c.childProbe !== false).map((c) => [c.name, c] as const))(
    "%s: workspace A's row under workspace B's own project is 404",
    async (_name, c) => {
      const before = await snapshotOfA();
      const res = await call(c, c.params(a, b.projectId));
      expect(res.status).toBe(404);
      expect(await snapshotOfA()).toEqual(before);
    }
  );

  it("never reached a side effect with a foreign id", () => {
    for (const [name, fn] of Object.entries(sideEffects)) {
      expect(fn, name).not.toHaveBeenCalled();
    }
  });

  it("lists under B's own project never include A's rows", async () => {
    const artifacts = CASES.find((c) => c.name === "GET runs/[runId]/artifacts")!;
    const res = await call(artifacts, artifacts.params(a, b.projectId));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });

  it("the same routes still answer for the owner", async () => {
    Object.assign(caller, { userId: a.userId, workspaceId: a.workspaceId });
    try {
      const getRun = CASES.find((c) => c.name === "GET runs/[runId]")!;
      expect((await call(getRun, getRun.params(a, a.projectId))).status).toBe(200);
      const getCase = CASES.find((c) => c.name === "GET test-cases/[testCaseId]")!;
      expect((await call(getCase, getCase.params(a, a.projectId))).status).toBe(200);
    } finally {
      Object.assign(caller, { userId: b.userId, workspaceId: b.workspaceId });
    }
  });
});
