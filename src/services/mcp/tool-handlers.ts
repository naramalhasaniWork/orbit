import { prisma } from "@/lib/db";

export async function getTestHealth(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, healthStatus: true, lastRunAt: true },
  });

  if (!project) return { error: "Project not found" };

  const lastRun = await prisma.testRun.findFirst({
    where: { projectId, status: "completed" },
    orderBy: { completedAt: "desc" },
    select: {
      totalTests: true,
      passed: true,
      failed: true,
      flaky: true,
      completedAt: true,
      summary: true,
    },
  });

  const recentRuns = await prisma.testRun.findMany({
    where: { projectId, status: "completed" },
    orderBy: { completedAt: "desc" },
    take: 5,
    select: { passed: true, totalTests: true, completedAt: true },
  });

  const flakyTests = await prisma.flakyTest.findMany({
    where: { projectId, isQuarantined: false },
    include: { testCase: { select: { name: true } } },
  });

  const trend = recentRuns.map((r) => ({
    passRate: r.totalTests > 0 ? Math.round((r.passed / r.totalTests) * 100) : 0,
    completedAt: r.completedAt,
  }));

  return {
    project: project.name,
    healthStatus: project.healthStatus,
    lastRun: lastRun
      ? {
          totalTests: lastRun.totalTests,
          passed: lastRun.passed,
          failed: lastRun.failed,
          flaky: lastRun.flaky,
          passRate:
            lastRun.totalTests > 0
              ? Math.round((lastRun.passed / lastRun.totalTests) * 100)
              : 0,
          completedAt: lastRun.completedAt,
          summary: lastRun.summary,
        }
      : null,
    trend,
    flakyTests: flakyTests.map((f) => ({
      name: f.testCase.name,
      occurrences: f.occurrences,
      passRate: f.passRate,
    })),
  };
}

export async function getTestPlan(projectId: string) {
  const plan = await prisma.testPlan.findFirst({
    where: { projectId, isActive: true },
    orderBy: { version: "desc" },
    include: {
      testCases: {
        where: { isEnabled: true },
        orderBy: { priorityScore: "desc" },
        select: {
          name: true,
          type: true,
          journey: true,
          priorityScore: true,
          isCritical: true,
          lastVerdict: true,
          rationale: true,
        },
      },
    },
  });

  if (!plan) return { error: "No active test plan found" };

  return {
    version: plan.version,
    totalTestCases: plan.testCases.length,
    testCases: plan.testCases,
  };
}

export async function getRunResults(projectId: string, runId?: string) {
  const run = runId
    ? await prisma.testRun.findFirst({ where: { id: runId, projectId } })
    : await prisma.testRun.findFirst({
        where: { projectId, status: "completed" },
        orderBy: { completedAt: "desc" },
      });

  if (!run) return { error: "No run found" };

  const results = await prisma.testResult.findMany({
    where: { testRunId: run.id },
    include: { testCase: { select: { name: true, type: true } } },
  });

  return {
    runId: run.id,
    status: run.status,
    mode: run.mode,
    totalTests: run.totalTests,
    passed: run.passed,
    failed: run.failed,
    summary: run.summary,
    results: results.map((r) => ({
      testName: r.testCase.name,
      testType: r.testCase.type,
      verdict: r.verdict,
      durationMs: r.durationMs,
      failureExplanation: r.failureExplanation,
      suggestedFix: r.suggestedFix,
    })),
  };
}

export async function getSystemMap(projectId: string, nodeType?: string) {
  const where = nodeType
    ? { projectId, type: nodeType as never }
    : { projectId };

  const nodes = await prisma.systemMapNode.findMany({
    where,
    select: { id: true, type: true, name: true, filePath: true, metadata: true },
    take: 200,
  });

  return {
    totalNodes: nodes.length,
    nodes: nodes.map((n) => ({
      type: n.type,
      name: n.name,
      filePath: n.filePath,
      metadata: n.metadata,
    })),
  };
}

export async function getFailingTests(projectId: string) {
  const lastRun = await prisma.testRun.findFirst({
    where: { projectId, status: "completed" },
    orderBy: { completedAt: "desc" },
    select: { id: true },
  });

  if (!lastRun) return { error: "No completed runs" };

  const failures = await prisma.testResult.findMany({
    where: { testRunId: lastRun.id, verdict: "fail" },
    include: { testCase: { select: { name: true, type: true, journey: true } } },
  });

  return {
    runId: lastRun.id,
    failingTests: failures.map((f) => ({
      testName: f.testCase.name,
      type: f.testCase.type,
      journey: f.testCase.journey,
      explanation: f.failureExplanation,
      suggestedFix: f.suggestedFix,
    })),
  };
}

export async function getCoverage(projectId: string, filePath?: string) {
  const nodes = await prisma.systemMapNode.findMany({
    where: {
      projectId,
      ...(filePath ? { filePath: { contains: filePath } } : {}),
    },
    select: { id: true, type: true, name: true, filePath: true },
  });

  const testCases = await prisma.testCase.findMany({
    where: { projectId, isEnabled: true },
    select: { name: true, lastVerdict: true, journey: true },
  });

  const totalRoutes = nodes.filter((n) => n.type === "route").length;
  const testedJourneys = new Set(
    testCases.filter((tc) => tc.journey).map((tc) => tc.journey)
  );

  return {
    totalNodes: nodes.length,
    totalRoutes,
    totalTestCases: testCases.length,
    journeysCovered: testedJourneys.size,
    nodes: nodes.slice(0, 50).map((n) => ({
      type: n.type,
      name: n.name,
      filePath: n.filePath,
    })),
  };
}

export async function triggerRun(
  projectId: string,
  mode: string,
  trigger: string
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, workspaceId: true },
  });

  if (!project) return { error: "Project not found" };

  const run = await prisma.testRun.create({
    data: {
      projectId,
      mode: mode as "full" | "smoke" | "regression" | "targeted",
      trigger: trigger as "api" | "push" | "pr" | "scheduled" | "manual" | "linear" | "deploy",
      status: "queued",
      totalTests: 0,
      passed: 0,
      failed: 0,
      flaky: 0,
      skipped: 0,
      creditsConsumed: 0,
    },
  });

  return {
    runId: run.id,
    projectId,
    projectName: project.name,
    mode: run.mode,
    trigger: run.trigger,
    status: run.status,
    message: `Test run queued for ${project.name}`,
  };
}

export async function searchFailures(
  projectId: string,
  query?: string,
  limit?: number
) {
  const maxResults = Math.min(limit ?? 20, 100);

  const recentRuns = await prisma.testRun.findMany({
    where: { projectId, status: "completed" },
    orderBy: { completedAt: "desc" },
    take: 10,
    select: { id: true },
  });

  if (recentRuns.length === 0) return { error: "No completed runs" };

  const runIds = recentRuns.map((r) => r.id);

  const failures = await prisma.testResult.findMany({
    where: {
      testRunId: { in: runIds },
      verdict: "fail",
      ...(query
        ? {
            OR: [
              { failureExplanation: { contains: query, mode: "insensitive" } },
              { testCase: { name: { contains: query, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: {
      testCase: { select: { name: true, type: true, journey: true } },
      testRun: { select: { id: true, completedAt: true } },
    },
    orderBy: { createdAt: "desc" },
    take: maxResults,
  });

  return {
    totalFailures: failures.length,
    query: query ?? null,
    failures: failures.map((f) => ({
      testName: f.testCase.name,
      testType: f.testCase.type,
      journey: f.testCase.journey,
      runId: f.testRun.id,
      runCompletedAt: f.testRun.completedAt,
      explanation: f.failureExplanation,
      suggestedFix: f.suggestedFix,
    })),
  };
}

export async function auditCode(projectId: string, filePath?: string) {
  const nodes = await prisma.systemMapNode.findMany({
    where: {
      projectId,
      ...(filePath ? { filePath: { contains: filePath } } : {}),
    },
    select: { id: true, type: true, name: true, filePath: true },
  });

  const testCases = await prisma.testCase.findMany({
    where: { projectId, isEnabled: true },
    select: { name: true, journey: true, type: true, lastVerdict: true },
  });

  const routes = nodes.filter((n) => n.type === "route");
  const endpoints = nodes.filter((n) => n.type === "endpoint");
  const testedJourneys = new Set(testCases.map((tc) => tc.journey).filter(Boolean));

  const untestedRoutes = routes.filter(
    (r) => !testedJourneys.has(r.name) && !testedJourneys.has(r.filePath)
  );

  const failingTests = testCases.filter((tc) => tc.lastVerdict === "fail");
  const coveragePercent =
    routes.length > 0
      ? Math.round(((routes.length - untestedRoutes.length) / routes.length) * 100)
      : 0;

  return {
    projectId,
    totalRoutes: routes.length,
    totalEndpoints: endpoints.length,
    totalTestCases: testCases.length,
    coveragePercent,
    untestedRoutes: untestedRoutes.slice(0, 20).map((r) => ({
      name: r.name,
      filePath: r.filePath,
    })),
    failingTests: failingTests.slice(0, 10).map((t) => ({
      name: t.name,
      type: t.type,
    })),
    recommendations: buildRecommendations(
      coveragePercent,
      untestedRoutes.length,
      failingTests.length
    ),
  };
}

function buildRecommendations(
  coverage: number,
  untestedCount: number,
  failingCount: number
): string[] {
  const recs: string[] = [];
  if (coverage < 50) {
    recs.push("Coverage is below 50%. Prioritize adding tests for critical user journeys.");
  }
  if (untestedCount > 10) {
    recs.push(`${untestedCount} routes lack test coverage. Focus on high-traffic routes first.`);
  }
  if (failingCount > 0) {
    recs.push(`${failingCount} tests are currently failing. Fix these before adding new tests.`);
  }
  if (recs.length === 0) {
    recs.push("Good coverage. Consider adding edge case and error state tests.");
  }
  return recs;
}
