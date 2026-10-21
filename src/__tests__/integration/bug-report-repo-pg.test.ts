import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dropTenant, realDbUrl, seedTenant, withRealDb, type TenantFixture } from "../helpers/real-db";

withRealDb();

describe.skipIf(!realDbUrl)("bug report repo (real Postgres)", () => {
  let db: typeof import("@/lib/db").prisma;
  let repo: typeof import("@/server/data/bug-report-repo");
  let t: TenantFixture;
  const id = randomUUID();

  beforeAll(async () => {
    db = (await import("@/lib/db")).prisma;
    repo = await import("@/server/data/bug-report-repo");
    t = await seedTenant(db, "bugs");
    await repo.createBugReport({
      id,
      workspaceId: t.workspaceId,
      userId: t.userId,
      message: "Run button does nothing\nsecond line",
      context: { path: "/dashboard/runs", userAgent: "UA", viewport: null, consoleErrors: [], appVersion: "0.1.0" },
      screenshotKey: `bug-reports/${id}.png`,
    });
  });

  afterAll(() => dropTenant(db, t));

  it("lists the report as open, with reporter and workspace", async () => {
    const open = await repo.listBugReports("open");
    const row = open.find((r) => r.id === id);
    expect(row).toMatchObject({ status: "open", hasScreenshot: true, workspace: { id: t.workspaceId } });
    expect(row?.reporter.id).toBe(t.userId);
    expect(await repo.countOpenBugReports()).toBeGreaterThanOrEqual(1);
  });

  it("resolves and reopens, recording and clearing who resolved it", async () => {
    const resolved = await repo.setBugReportStatus(id, "resolved", t.userId);
    expect(resolved).toMatchObject({ status: "resolved", resolvedBy: t.userId });
    expect(resolved?.resolvedAt).not.toBeNull();
    expect((await repo.listBugReports("open")).some((r) => r.id === id)).toBe(false);

    const reopened = await repo.setBugReportStatus(id, "open", t.userId);
    expect(reopened).toMatchObject({ status: "open", resolvedAt: null, resolvedBy: null });
    expect(await repo.setBugReportStatus(randomUUID(), "resolved", t.userId)).toBeNull();
  });

  it("keeps the report when its workspace is deleted", async () => {
    await db.workspace.delete({ where: { id: t.workspaceId } });
    expect((await repo.getBugReport(id))?.workspace).toBeNull();
    await db.user.delete({ where: { id: t.userId } });
    expect(await repo.getBugReport(id)).toBeNull(); // the reporter's account takes its reports with it
    t = undefined as unknown as TenantFixture;
  });
});
