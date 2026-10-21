import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dropTenant, realDbUrl, seedTenant, withRealDb, type TenantFixture } from "../helpers/real-db";

withRealDb();

const MIGRATION = join(__dirname, "../../../prisma/migrations/20261026_test_results_case_cascade/migration.sql");
const ROLLBACK = new Error("rollback");

describe.skipIf(!realDbUrl)("migration 20261026_test_results_case_cascade (real Postgres)", () => {
  let db: typeof import("@/lib/db").prisma;
  let t: TenantFixture;

  beforeAll(async () => {
    db = (await import("@/lib/db")).prisma;
    t = await seedTenant(db, "cascade");
    await db.testResult.create({ data: { testRunId: t.runId, testCaseId: t.testCaseId, verdict: "pass" } });
  });

  afterAll(() => dropTenant(db, t));

  it("lets a test case with results be deleted, taking its results with it", async () => {
    const statements = readFileSync(MIGRATION, "utf8")
      .split(";")
      .map((sql) => sql.replace(/^\s*--.*$/gm, "").trim())
      .filter(Boolean);

    // Applied inside a transaction that is rolled back, so the shared database is left as it was.
    await expect(
      db.$transaction(async (tx) => {
        for (const sql of statements) await tx.$executeRawUnsafe(sql);
        await tx.testCase.delete({ where: { id: t.testCaseId } });
        expect(await tx.testResult.count({ where: { testCaseId: t.testCaseId } })).toBe(0);
        throw ROLLBACK;
      })
    ).rejects.toBe(ROLLBACK);

    expect(await db.testResult.count({ where: { testCaseId: t.testCaseId } })).toBe(1);
  });
});
