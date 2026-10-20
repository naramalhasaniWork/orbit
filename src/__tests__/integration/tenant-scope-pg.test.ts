import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dropTenant, realDbUrl, seedTenant, useRealDb, type TenantFixture } from "../helpers/real-db";

useRealDb();

describe.skipIf(!realDbUrl)("tenant scopes on real Postgres", () => {
  let db: typeof import("@/lib/db").prisma;
  let scope: typeof import("@/server/data/scope");
  let guard: typeof import("@/server/data/tenant-guard");
  let a: TenantFixture;
  let b: TenantFixture;

  beforeAll(async () => {
    db = (await import("@/lib/db")).prisma;
    scope = await import("@/server/data/scope");
    guard = await import("@/server/data/tenant-guard");
    a = await seedTenant(db, "a");
    b = await seedTenant(db, "b");
  });

  afterAll(async () => {
    await dropTenant(db, a);
    await dropTenant(db, b);
  });

  it("ws.project(id) opens its own project and 404s another workspace's", async () => {
    const wsA = scope.forWorkspace(a.workspaceId);
    expect((await wsA.project(a.projectId)).id).toBe(a.projectId);
    await expect(scope.forWorkspace(b.workspaceId).project(a.projectId)).rejects.toMatchObject({ name: "NotFoundError" });
  });

  it("unique lookups, updates and deletes miss rows of another tenant", async () => {
    const projectB = await scope.forWorkspace(b.workspaceId).project(b.projectId);
    expect(await projectB.db.testRun.findUnique({ where: { id: a.runId } })).toBeNull();
    await expect(projectB.db.testRun.update({ where: { id: a.runId }, data: { status: "cancelled" } }))
      .rejects.toMatchObject({ code: "P2025" });
    expect((await projectB.db.secret.deleteMany({ where: { id: a.secretId } })).count).toBe(0);
    expect(await db.secret.findUnique({ where: { id: a.secretId } })).not.toBeNull();

    // results reach their tenant through the run relation
    expect(await scope.forWorkspace(b.workspaceId).db.testResult.count({ where: { testRunId: a.runId } })).toBe(0);
  });

  it("finds its own rows from either scope level", async () => {
    const wsA = scope.forWorkspace(a.workspaceId);
    expect((await wsA.db.testRun.findUnique({ where: { id: a.runId } }))?.id).toBe(a.runId);
    const projectA = await wsA.project(a.projectId);
    expect((await projectA.db.testCase.findUnique({ where: { id: a.testCaseId } }))?.id).toBe(a.testCaseId);
    expect((await projectA.db.project.findFirst({ select: { id: true } }))?.id).toBe(a.projectId);
  });

  it("creates get their owner, and project rows cannot be created from the workspace level", async () => {
    const wsA = scope.forWorkspace(a.workspaceId);
    const projectA = await wsA.project(a.projectId);
    const env = await projectA.db.environment.create({ data: { name: "preview", url: "https://p.example.com", projectId: a.projectId } });
    expect(env.projectId).toBe(a.projectId);
    await expect(wsA.db.environment.create({ data: { name: "x", url: "https://x", projectId: a.projectId } }))
      .rejects.toMatchObject({ name: "ScopeError" });
    await expect(projectA.db.environment.create({ data: { name: "x", url: "https://x", projectId: b.projectId } }))
      .rejects.toMatchObject({ name: "ScopeError" });
  });

  it("tx keeps the scope inside the transaction", async () => {
    const projectA = await scope.forWorkspace(a.workspaceId).project(a.projectId);
    const seen = await projectA.tx(async (p) => [
      await p.db.testRun.findUnique({ where: { id: a.runId } }),
      await p.db.testRun.findUnique({ where: { id: b.runId } }),
    ]);
    expect(seen.map((r) => r?.id ?? null)).toEqual([a.runId, null]);
  });

  it("tenantGuard throws on an unscoped tenant query and lets scoped and global ones through", async () => {
    const guarded = guard.withTenantGuard(db, "throw");
    await expect(guarded.testRun.findUnique({ where: { id: a.runId } })).rejects.toBeInstanceOf(guard.TenantGuardError);
    await expect(guarded.testRun.findFirst({ where: { id: a.runId, projectId: a.projectId } })).resolves.toMatchObject({ id: a.runId });
    await expect(guarded.user.count()).resolves.toEqual(expect.any(Number));
  });
});
