import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dropTenant, realDbUrl, seedTenant, withRealDb, type TenantFixture } from "../helpers/real-db";

withRealDb();

describe.skipIf(!realDbUrl)("migration 20261032_onboarding_tour (real Postgres)", () => {
  let db: typeof import("@/lib/db").prisma;
  let repo: typeof import("@/server/data/tour-repo");
  let t: TenantFixture;

  beforeAll(async () => {
    db = (await import("@/lib/db")).prisma;
    repo = await import("@/server/data/tour-repo");
    t = await seedTenant(db, "tour");
  });

  afterAll(() => dropTenant(db, t));

  it("adds a nullable users.onboarding_tour_completed_at", async () => {
    const cols = await db.$queryRaw<Array<{ is_nullable: string; data_type: string }>>`
      SELECT is_nullable, data_type FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'onboarding_tour_completed_at'`;
    expect(cols).toEqual([{ is_nullable: "YES", data_type: "timestamp without time zone" }]);
  });

  it("persists completion per user and clears it for a replay", async () => {
    expect(await repo.getTourCompletedAt(t.userId)).toBeNull();
    const at = new Date("2026-10-20T12:00:00.000Z");
    await repo.setTourCompletedAt(t.userId, at);
    expect(await repo.getTourCompletedAt(t.userId)).toEqual(at);
    await repo.setTourCompletedAt(t.userId, null);
    expect(await repo.getTourCompletedAt(t.userId)).toBeNull();
  });

  it("builds the tour context from the workspace's own rows", async () => {
    const { forWorkspace } = await import("@/server/data/scope");
    await db.testRun.update({ where: { id: t.runId }, data: { status: "completed", totalTests: 3, passed: 2, failed: 1 } });
    await db.systemMapNode.create({ data: { projectId: t.projectId, type: "route", name: "/login", filePath: "app/login/page.tsx" } });

    const ctx = await repo.loadTourContext(forWorkspace(t.workspaceId), t.projectId, false);
    expect(ctx).toMatchObject({ projectId: t.projectId, nodeCount: 1, githubConnected: false });
    expect(ctx?.run).toMatchObject({ id: t.runId, total: 3, passed: 2, failed: 1 });

    // Another workspace's project reads as missing.
    const other = await seedTenant(db, "tour-other");
    try {
      expect(await repo.loadTourContext(forWorkspace(other.workspaceId), t.projectId, false)).toBeNull();
    } finally {
      await dropTenant(db, other);
    }
  });
});
