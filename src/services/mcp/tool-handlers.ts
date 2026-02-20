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

  const flakyTests = await prisma.flakyTest.findMany({
    where: { projectId, isQuarantined: false },
    include: { testCase: { select: { name: true } } },
  });

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
