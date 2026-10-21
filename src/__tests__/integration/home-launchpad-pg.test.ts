import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dropTenant, realDbUrl, seedTenant, withRealDb, type TenantFixture } from "../helpers/real-db";

withRealDb();

describe.skipIf(!realDbUrl)("home launchpad (real Postgres)", () => {
  let db: typeof import("@/lib/db").prisma;
  let launchpad: typeof import("@/lib/dashboard/launchpad");
  let t: TenantFixture;
  const project = () => ({ id: t.projectId, repoOwner: "w2", repoName: "web" });

  beforeAll(async () => {
    db = (await import("@/lib/db")).prisma;
    launchpad = await import("@/lib/dashboard/launchpad");
    t = await seedTenant(db, "home");
  });

  afterAll(() => dropTenant(db, t));

  it("an empty workspace: no PRs, no team feed, no map; only the unapproved plan waits", async () => {
    const lp = await launchpad.getLaunchpad(project(), t.workspaceId, t.userId);
    expect(lp.pullRequests).toEqual([]);
    expect(lp.activity).toEqual([]);
    expect(lp.map).toEqual({ nodes: [], edges: [] });
    expect(lp.jumpBackIn.map((i) => i.detail)).toEqual(["Waiting for approval"]);
  });

  it("a one-member workspace never shows the team feed, even with audit rows", async () => {
    await db.auditLog.create({ data: { workspaceId: t.workspaceId, userId: t.userId, action: "run.trigger", resourceId: t.runId } });
    expect(await launchpad.getTeamActivity(t.workspaceId)).toEqual([]);
  });

  it("PR rows carry the stored PR number, title, journeys and author; the team feed names the run", async () => {
    const pr = await db.testRun.create({
      data: {
        projectId: t.projectId, trigger: "pr", status: "completed", prNumber: 318, branch: "fix/coupon",
        commitSha: "7c2a1b9e44", failed: 1, durationMs: 90_000, triggeredById: t.userId,
        metadata: { prTitle: "Fix the coupon field" },
      },
    });
    await db.testCase.update({ where: { id: t.testCaseId }, data: { journey: "Checkout" } });
    await db.testResult.create({ data: { testRunId: pr.id, testCaseId: t.testCaseId, verdict: "fail" } });
    const second = await db.user.create({ data: { email: `second-${t.workspaceId.slice(0, 8)}@w2.test`, name: "Kim" } });
    await db.workspaceMember.create({ data: { workspaceId: t.workspaceId, userId: second.id, role: "member" } });
    await db.auditLog.create({ data: { workspaceId: t.workspaceId, userId: second.id, action: "run.trigger", resourceId: pr.id } });

    try {
      const lp = await launchpad.getLaunchpad(project(), t.workspaceId, t.userId);
      expect(lp.pullRequests).toHaveLength(1);
      expect(lp.pullRequests[0]).toMatchObject({
        ref: "w2/web#318", title: "Fix the coupon field", journeys: ["Checkout"], tone: "fail", durationMs: 90_000,
      });
      expect(lp.pullRequests[0].author?.email).toMatch(/@w2\.test$/);
      expect(lp.jumpBackIn[0]).toMatchObject({ kind: "run", detail: "1 failed" });
      expect(lp.activity.map((a) => `${a.who?.name} ${a.what}`)).toContain(`Kim started Run #${pr.sequenceNumber}`);
    } finally {
      await db.workspaceMember.deleteMany({ where: { userId: second.id } });
      await db.auditLog.deleteMany({ where: { userId: second.id } });
      await db.user.delete({ where: { id: second.id } });
    }
  });
});
