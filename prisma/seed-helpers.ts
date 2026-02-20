import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import {
  IDS, NODES, EDGES, AUDIT_ENTRIES, TEST_CASES, RUNS, RESULTS,
  CREDIT_TRANSACTIONS, WEBHOOK_EVENTS, INTEGRATION_CONFIGS,
  RUN_ARTIFACTS, SELECTOR_HISTORY, TEST_CASE_VERSIONS,
  FAILURE_PATTERNS, BASELINE_SNAPSHOTS, PLUGIN_INSTALLATIONS,
  DOMAIN_KNOWLEDGE_FILES, WEBHOOK_SUBSCRIPTIONS,
} from "./seed-data";

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

export async function seedCreditTransactions(prisma: PrismaClient, workspaceId: string) {
  await prisma.creditTransaction.deleteMany({ where: { workspaceId } });
  await prisma.creditTransaction.createMany({
    data: CREDIT_TRANSACTIONS.map((ct) => ({
      workspaceId, type: ct.type, amount: ct.amount, balance: ct.balance,
      description: ct.description, testRunId: ct.testRunId,
      createdAt: ct.createdAt,
    })),
  });
}

export async function seedWebhookEvents(prisma: PrismaClient, projectId: string) {
  await prisma.webhookEvent.deleteMany({ where: { projectId } });
  await prisma.webhookEvent.createMany({
    data: WEBHOOK_EVENTS.map((we) => ({
      projectId, provider: we.provider, event: we.event,
      externalId: we.externalId, payload: {} as Prisma.InputJsonValue,
      status: we.status, error: we.error, createdAt: we.createdAt,
      processedAt: we.status === "processed" ? we.createdAt : null,
    })),
  });
}

export async function seedIntegrationConfigs(prisma: PrismaClient, workspaceId: string) {
  for (const ic of INTEGRATION_CONFIGS) {
    await prisma.integrationConfig.upsert({
      where: { integration_config_unique: { workspaceId, provider: ic.provider } },
      update: { isEnabled: ic.isEnabled, config: ic.config as Prisma.InputJsonValue },
      create: {
        workspaceId, provider: ic.provider, isEnabled: ic.isEnabled,
        config: ic.config as Prisma.InputJsonValue,
      },
    });
  }
}

export async function seedRunArtifacts(
  prisma: PrismaClient, projectId: string,
  runs: { id: string }[], testCases: { id: string }[]
) {
  await prisma.runArtifact.deleteMany({ where: { projectId } });

  const resultMap = new Map<string, string>();
  for (const run of runs) {
    const results = await prisma.testResult.findMany({ where: { testRunId: run.id } });
    for (const r of results) {
      resultMap.set(`${run.id}:${r.testCaseId}`, r.id);
    }
  }

  const data = RUN_ARTIFACTS.map((a) => {
    const testRunId = runs[a.runIndex].id;
    const testResultId = a.resultCaseIndex !== null
      ? resultMap.get(`${testRunId}:${testCases[a.resultCaseIndex].id}`) ?? null
      : null;
    return {
      projectId, testRunId, testResultId,
      type: a.type, storageKey: a.storageKey, fileName: a.fileName,
      contentType: a.contentType, sizeBytes: a.sizeBytes, stepIndex: a.stepIndex,
    };
  });

  await prisma.runArtifact.createMany({ data });
  return data.length;
}

export async function seedSelectorHistory(prisma: PrismaClient, projectId: string) {
  await prisma.selectorHistory.deleteMany({ where: { projectId } });
  const mappings = await prisma.selectorMapping.findMany({ where: { projectId } });
  if (mappings.length === 0) return;

  const data = SELECTOR_HISTORY.map((sh, i) => ({
    projectId,
    selectorMappingId: mappings[i % mappings.length].id,
    previousSelector: sh.previousSelector,
    newSelector: sh.newSelector,
    confidence: sh.confidence,
    testRunId: sh.testRunId,
    pageUrl: sh.pageUrl,
    createdAt: sh.createdAt,
  }));

  await prisma.selectorHistory.createMany({ data });
}

export async function seedTestCaseVersions(prisma: PrismaClient, testCases: { id: string }[]) {
  const caseIds = testCases.map((tc) => tc.id);
  await prisma.testCaseVersion.deleteMany({ where: { testCaseId: { in: caseIds } } });

  const data = TEST_CASE_VERSIONS.map((v) => {
    const tc = TEST_CASES[v.caseIndex];
    return {
      testCaseId: testCases[v.caseIndex].id,
      version: v.version,
      name: tc.name,
      type: tc.type,
      steps: tc.steps as Prisma.InputJsonValue,
      rationale: tc.rationale,
      changedBy: v.changedBy,
      changeNote: v.changeNote,
      createdAt: v.createdAt,
    };
  });

  await prisma.testCaseVersion.createMany({ data });
}

export async function seedFailurePatterns(
  prisma: PrismaClient, projectId: string, testCases: { id: string }[]
) {
  await prisma.failurePattern.deleteMany({ where: { projectId } });
  await prisma.failurePattern.createMany({
    data: FAILURE_PATTERNS.map((fp) => ({
      projectId,
      pattern: fp.pattern,
      category: fp.category,
      occurrences: fp.occurrences,
      testCaseIds: fp.testCaseIndices.map((i) => testCases[i].id) as Prisma.InputJsonValue,
      firstSeenAt: fp.firstSeenAt,
      lastSeenAt: fp.lastSeenAt,
    })),
  });
}

export async function seedBaselineSnapshots(
  prisma: PrismaClient, projectId: string, lastRunId: string
) {
  await prisma.baselineSnapshot.deleteMany({ where: { projectId } });
  await prisma.baselineSnapshot.createMany({
    data: BASELINE_SNAPSHOTS.map((bs) => ({
      projectId,
      testRunId: lastRunId,
      type: bs.type,
      routePath: bs.routePath,
      endpoint: bs.endpoint,
      storageKey: bs.storageKey,
    })),
  });
}

export async function seedPluginInstallations(prisma: PrismaClient, workspaceId: string) {
  for (const pi of PLUGIN_INSTALLATIONS) {
    await prisma.pluginInstallation.upsert({
      where: { plugin_installation_unique: { workspaceId, pluginName: pi.pluginName } },
      update: { version: pi.version, isEnabled: pi.isEnabled, config: pi.config as Prisma.InputJsonValue },
      create: {
        workspaceId, pluginName: pi.pluginName, version: pi.version,
        isEnabled: pi.isEnabled, config: pi.config as Prisma.InputJsonValue,
      },
    });
  }
}

export async function seedDomainKnowledgeFiles(prisma: PrismaClient, workspaceId: string) {
  await prisma.domainKnowledgeFile.deleteMany({ where: { workspaceId } });
  await prisma.domainKnowledgeFile.createMany({
    data: DOMAIN_KNOWLEDGE_FILES.map((dk) => ({
      workspaceId,
      name: dk.name,
      type: dk.type,
      storageKey: dk.storageKey,
      sizeBytes: dk.sizeBytes,
      chunkCount: dk.chunkCount,
    })),
  });
}

export async function seedWebhookSubscriptions(prisma: PrismaClient, workspaceId: string) {
  await prisma.webhookSubscription.deleteMany({ where: { workspaceId } });
  await prisma.webhookSubscription.createMany({
    data: WEBHOOK_SUBSCRIPTIONS.map((ws) => ({
      workspaceId,
      url: ws.url,
      events: ws.events as Prisma.InputJsonValue,
      isEnabled: ws.isEnabled,
      description: ws.description,
    })),
  });
}
