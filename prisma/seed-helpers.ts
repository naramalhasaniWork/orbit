import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { IDS, NODES, EDGES, AUDIT_ENTRIES, TEST_CASES, RUNS, RESULTS } from "./seed-data";

export async function seedUsers(prisma: PrismaClient) {
  const defs = [
    { id: IDS.users.admin, email: "admin@orbit-test.com", name: "Alex Admin" },
    { id: IDS.users.member, email: "member@orbit-test.com", name: "Morgan Member" },
    { id: IDS.users.viewer, email: "viewer@orbit-test.com", name: "Val Viewer" },
  ];
  return Promise.all(defs.map((u) =>
    prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name },
      create: { id: u.id, email: u.email, name: u.name, settings: {} },
    })
  ));
}

export async function seedMembers(prisma: PrismaClient, workspaceId: string, users: { id: string }[]) {
  const roles = ["admin", "member", "viewer"] as const;
  const ids = [IDS.members.admin, IDS.members.member, IDS.members.viewer];
  return Promise.all(users.map((u, i) =>
    prisma.workspaceMember.upsert({
      where: { workspace_member_unique: { workspaceId, userId: u.id } },
      update: { role: roles[i] },
      create: { id: ids[i], workspaceId, userId: u.id, role: roles[i] },
    })
  ));
}

export async function seedProject(prisma: PrismaClient, workspaceId: string) {
  return prisma.project.upsert({
    where: { project_slug_workspace: { workspaceId, slug: "acme-dashboard" } },
    update: { name: "Acme Dashboard", status: "active", healthStatus: "healthy", framework: "nextjs", onboardingCompleted: true },
    create: {
      id: IDS.project, workspaceId, name: "Acme Dashboard", slug: "acme-dashboard",
      repoUrl: "https://github.com/vercel/next.js", repoProvider: "github",
      repoOwner: "vercel", repoName: "next.js", defaultBranch: "main",
      framework: "nextjs", status: "active", healthStatus: "healthy",
      onboardingCompleted: true, lastIndexedAt: new Date(),
      config: { testTimeout: 30000, maxRetries: 2 },
      settings: { autoRun: true, notifyOnFailure: true },
    },
  });
}

export async function seedEnvironments(prisma: PrismaClient, projectId: string) {
  const envs = [
    { id: IDS.environments.staging, name: "Staging", type: "staging" as const, url: "https://staging.acme-app.com", isDefault: false },
    { id: IDS.environments.preview, name: "Preview", type: "preview" as const, url: "https://preview.acme-app.com", isDefault: false },
    { id: IDS.environments.qa, name: "QA", type: "qa" as const, url: "https://qa.acme-app.com", isDefault: true },
  ];
  return Promise.all(envs.map((e) =>
    prisma.environment.upsert({
      where: { id: e.id },
      update: { name: e.name, url: e.url, isDefault: e.isDefault },
      create: { ...e, projectId },
    })
  ));
}

export async function seedSystemMap(prisma: PrismaClient, projectId: string) {
  await prisma.systemMapEdge.deleteMany({ where: { projectId } });
  await prisma.systemMapNode.deleteMany({ where: { projectId } });

  await prisma.systemMapNode.createMany({
    data: NODES.map((n) => ({
      id: n.id, projectId, type: n.type, name: n.name,
      filePath: n.filePath, metadata: n.metadata as Prisma.InputJsonValue,
    })),
  });

  await prisma.systemMapEdge.createMany({
    data: EDGES.map((e) => ({
      id: e.id, projectId,
      sourceNodeId: NODES[e.sourceIndex - 1].id,
      targetNodeId: NODES[e.targetIndex - 1].id,
      relationship: e.relationship,
    })),
  });
}

export async function seedTestPlan(prisma: PrismaClient, projectId: string) {
  return prisma.testPlan.upsert({
    where: { id: IDS.testPlan },
    update: { isActive: true, version: 1 },
    create: {
      id: IDS.testPlan, projectId, version: 1, isActive: true,
      generatedBy: "planner",
      summary: {
        totalCases: 15,
        journeys: ["Onboarding", "Purchase", "Settings", "API", "Security", "Search"],
        coverage: { routes: 0.85, endpoints: 0.78, auth: 0.9 },
        riskScore: 72,
      },
    },
  });
}

export async function seedTestCases(prisma: PrismaClient, testPlanId: string, projectId: string) {
  await prisma.testCase.deleteMany({ where: { testPlanId } });
  await prisma.testCase.createMany({
    data: TEST_CASES.map((tc) => ({
      id: tc.id, testPlanId, projectId, name: tc.name, type: tc.type,
      journey: tc.journey, priorityScore: tc.priorityScore,
      criticality: tc.criticality, risk: tc.risk, coverageGap: tc.coverageGap,
      isCritical: tc.isCritical, steps: tc.steps as Prisma.InputJsonValue,
      rationale: tc.rationale, isEnabled: true,
    })),
  });
  return prisma.testCase.findMany({ where: { testPlanId }, orderBy: { createdAt: "asc" } });
}

export async function seedTestRuns(prisma: PrismaClient, projectId: string, testPlanId: string, triggeredById: string) {
  await prisma.testRun.deleteMany({ where: { projectId } });
  await prisma.testRun.createMany({
    data: RUNS.map((r) => ({
      id: r.id, projectId, environmentId: IDS.environments.staging, testPlanId,
      status: r.status, mode: r.mode, trigger: r.trigger, triggeredById,
      branch: r.branch, commitSha: r.commitSha, totalTests: r.totalTests,
      passed: r.passed, failed: r.failed, flaky: r.flaky, skipped: r.skipped,
      creditsConsumed: r.creditsConsumed, summary: r.summary,
      startedAt: r.startedAt, completedAt: r.completedAt,
      durationMs: r.durationMs, createdAt: r.createdAt,
    })),
  });
  return prisma.testRun.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
}

export async function seedTestResults(
  prisma: PrismaClient, runs: { id: string }[], testCases: { id: string }[]
): Promise<number> {
  await prisma.testResult.deleteMany({ where: { testRunId: { in: runs.map((r) => r.id) } } });

  const data = RESULTS.map((r) => ({
    testRunId: runs[r.runIndex].id, testCaseId: testCases[r.caseIndex].id,
    verdict: r.verdict, durationMs: r.durationMs, retryCount: r.retryCount,
    steps: r.steps as Prisma.InputJsonValue,
    failureExplanation: r.failureExplanation, suggestedFix: r.suggestedFix,
    artifacts: {} as Prisma.InputJsonValue,
    healedSelectors: (r.verdict === "healed"
      ? [{ original: ".login-redirect", healed: "[data-testid=login-page]", confidence: 0.92 }]
      : []) as Prisma.InputJsonValue,
  }));

  await prisma.testResult.createMany({ data });

  for (const tc of testCases) {
    const latest = await prisma.testResult.findFirst({
      where: { testCaseId: tc.id }, orderBy: { createdAt: "desc" },
    });
    if (latest) {
      await prisma.testCase.update({
        where: { id: tc.id },
        data: { lastVerdict: latest.verdict, lastRunAt: latest.createdAt },
      });
    }
  }
  return data.length;
}

export async function seedFlakyTests(prisma: PrismaClient, projectId: string, testCases: { id: string }[]) {
  const defs = [
    { caseIndex: 8, occurrences: 4, passRate: 0.72 },
    { caseIndex: 2, occurrences: 2, passRate: 0.85 },
    { caseIndex: 14, occurrences: 3, passRate: 0.78 },
  ];
  for (const f of defs) {
    await prisma.flakyTest.upsert({
      where: { flaky_test_unique: { projectId, testCaseId: testCases[f.caseIndex].id } },
      update: { occurrences: f.occurrences, passRate: f.passRate },
      create: {
        projectId, testCaseId: testCases[f.caseIndex].id,
        occurrences: f.occurrences, passRate: f.passRate,
        isQuarantined: f.passRate < 0.75,
      },
    });
  }
}

export async function seedAuditLog(prisma: PrismaClient, workspaceId: string, userId: string) {
  await prisma.auditLog.deleteMany({ where: { workspaceId } });
  await prisma.auditLog.createMany({
    data: AUDIT_ENTRIES.map((a) => ({
      workspaceId, userId, action: a.action,
      resourceType: a.resourceType, resourceId: a.resourceId,
      metadata: a.metadata as Prisma.InputJsonValue,
      ipAddress: "127.0.0.1", createdAt: a.createdAt,
    })),
  });
}
