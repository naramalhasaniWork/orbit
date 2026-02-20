import { prisma } from "@/lib/db";
import type { RunTrigger, RunMode } from "@/generated/prisma/client";
import { selectRunMode } from "./mode-selector";
import { TokenBudget } from "./token-budget";
import type { AgentPhase } from "./token-budget";
import { getProjectContext } from "./context-manager";
import {
  createRun,
  updateRunStatus,
  updateRunStats,
  isRunCancelled,
} from "./run-manager";
import { checkBudgetLimit } from "@/lib/billing/usage-aggregator";
import { startTrace, completeTrace, failTrace } from "@/services/tracing";

interface PipelineInput {
  projectId: string;
  trigger: RunTrigger;
  triggeredById?: string;
  branch?: string;
  commitSha?: string;
  prNumber?: number;
  changedFiles?: string[];
  targetPaths?: string[];
  maxTokenBudget?: number;
  requestedMode?: RunMode;
}

interface PipelineResult {
  runId: string;
  status: "completed" | "failed" | "cancelled";
  passed: number;
  failed: number;
  flaky: number;
  totalTests: number;
  durationMs: number;
  creditsConsumed: number;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    byAgent: Record<AgentPhase, { inputTokens: number; outputTokens: number; callCount: number }>;
  };
}

class PipelineCancelledError extends Error {
  constructor() { super("Run cancelled"); this.name = "PipelineCancelledError"; }
}

async function checkCancellation(runId: string): Promise<void> {
  if (await isRunCancelled(runId)) throw new PipelineCancelledError();
}

export async function executePipeline(
  input: PipelineInput
): Promise<PipelineResult> {
  const tokenBudget = new TokenBudget(
    input.maxTokenBudget
      ? { maxInputTokens: input.maxTokenBudget }
      : undefined
  );

  const context = await getProjectContext(input.projectId);

  // Pre-run budget check — block if workspace has exceeded limits
  const budget = await checkBudgetLimit(context.project.workspaceId);
  if (budget.isOverLimit) {
    throw new Error(
      "Workspace budget exceeded. Upgrade your plan or wait for the next billing period."
    );
  }

  const isFirstRun = context.lastRun === null;
  const { mode, reason, skipIndexing, skipPlanning } = selectRunMode({
    trigger: input.trigger,
    changedFiles: input.changedFiles,
    targetPaths: input.targetPaths,
    isFirstRun,
    requestedMode: input.requestedMode,
  });

  const run = await createRun({
    projectId: input.projectId,
    environmentId: context.defaultEnvironment?.id,
    testPlanId: context.activePlan?.id,
    mode,
    trigger: input.trigger,
    triggeredById: input.triggeredById,
    branch: input.branch,
    commitSha: input.commitSha,
    prNumber: input.prNumber,
  });

  try {
    // Phase 1: Indexing
    await checkCancellation(run.id);

    if (!skipIndexing) {
      await runIndexingPhase(
        run.id, input.projectId, input.branch, input.changedFiles, context, reason
      );
    }

    // Phase 1.5: Code Audit (full runs only)
    if (mode === "full") {
      await checkCancellation(run.id);
      await runAuditPhase(run.id, input.projectId);
    }

    // Phase 2: Planning
    await checkCancellation(run.id);

    let testPlanId = context.activePlan?.id;
    if (!skipPlanning || !testPlanId) {
      testPlanId = await runPlanningPhase(
        run.id, input.projectId, mode, testPlanId, tokenBudget
      );
    }

    // Check budget after planning
    if (tokenBudget.isOverBudget()) {
      console.warn(
        `[Pipeline] Token budget exceeded after planning for run ${run.id}`
      );
    }

    // Phase 3: Execution
    await checkCancellation(run.id);
    await runExecutionPhase(run.id, input.projectId, testPlanId, mode);

    // Phase 4: Reporting
    await checkCancellation(run.id);
    await runReportingPhase(run.id, input.projectId);

    // Finalize
    return await finalizePipeline(run.id, input.projectId, tokenBudget);
  } catch (error) {
    if (error instanceof PipelineCancelledError) {
      const updatedRun = await updateRunStats(run.id);
      return buildResult(run.id, "cancelled", updatedRun, tokenBudget);
    }

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[Pipeline] Failed for project ${input.projectId}:`,
      errorMessage
    );

    await updateRunStatus(run.id, "failed", errorMessage);
    const updatedRun = await updateRunStats(run.id);
    return buildResult(run.id, "failed", updatedRun, tokenBudget);
  }
}

async function runIndexingPhase(
  runId: string,
  projectId: string,
  branch: string | undefined,
  changedFiles: string[] | undefined,
  context: Awaited<ReturnType<typeof getProjectContext>>,
  reason: string
): Promise<void> {
  const needsReindex = await shouldReindex(projectId, changedFiles);
  if (!needsReindex) return;

  const isIncremental = changedFiles && changedFiles.length > 0;
  const traceId = await startTrace({
    runId,
    projectId,
    agentPhase: "analyst",
    inputSummary: isIncremental
      ? `Incremental index: ${changedFiles.length} changed files`
      : "Full repository indexing",
  });

  try {
    await updateRunStatus(runId, "indexing", reason);
    const branchToUse = branch ?? context.project.defaultBranch;

    if (isIncremental) {
      const { runIncrementalIndex } = await import(
        "@/services/indexing/incremental"
      );
      await runIncrementalIndex(projectId, branchToUse, changedFiles);
    } else {
      const { runIndexingPipeline } = await import(
        "@/services/indexing/pipeline"
      );
      await runIndexingPipeline(projectId, branchToUse);
    }

    await completeTrace(traceId, {
      outputSummary: isIncremental
        ? `Indexed ${changedFiles.length} changed files on ${branchToUse}`
        : `Full index completed on ${branchToUse}`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown indexing error";
    await failTrace(traceId, msg);
    throw error;
  }
}

async function runAuditPhase(runId: string, projectId: string): Promise<void> {
  await updateRunStatus(runId, "planning", "Running code audit");
  try {
    const { runCodeAudit } = await import("@/services/auditing/auditor");
    await runCodeAudit({ projectId, runId });
  } catch (error) {
    // Audit is non-blocking — log and continue
    console.warn("[Pipeline] Code audit failed, continuing:", error);
  }
}

async function runPlanningPhase(
  runId: string,
  projectId: string,
  mode: RunMode,
  existingPlanId: string | undefined,
  tokenBudget: TokenBudget
): Promise<string> {
  // If we already have a plan and mode doesn't require regeneration, use it
  if (existingPlanId && mode !== "full") {
    return existingPlanId;
  }

  const traceId = await startTrace({
    runId,
    projectId,
    agentPhase: "planner",
    inputSummary: `Generate ${mode} test plan`,
  });

  try {
    await updateRunStatus(runId, "planning", "Generating test plan");
    const { generatePlan } = await import("@/services/planning/planner");
    const planResult = await generatePlan({ projectId, mode });

    tokenBudget.record(
      planResult.tokensUsed.input,
      planResult.tokensUsed.output,
      0,
      "planner"
    );

    await prisma.testRun.update({
      where: { id: runId },
      data: { testPlanId: planResult.plan.id },
    });

    await completeTrace(traceId, {
      outputSummary: `Generated plan with ${planResult.testCases.length} test cases`,
      inputTokens: planResult.tokensUsed.input,
      outputTokens: planResult.tokensUsed.output,
    });

    return planResult.plan.id;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown planning error";
    await failTrace(traceId, msg);
    throw error;
  }
}

async function runExecutionPhase(
  runId: string,
  projectId: string,
  testPlanId: string,
  mode: RunMode
): Promise<void> {
  const traceId = await startTrace({
    runId,
    projectId,
    agentPhase: "executor",
    inputSummary: `Execute ${mode} test suite`,
  });

  try {
    await updateRunStatus(runId, "executing", "Running tests");

    // Use parallel execution for full/smoke runs (journey-based partitioning),
    // sequential for targeted/regression runs
    if (mode === "full" || mode === "smoke") {
      const { runTestSuiteParallel } = await import("@/services/execution/runner");
      await runTestSuiteParallel(runId, testPlanId, mode);
    } else {
      const { runTestSuite } = await import("@/services/execution/runner");
      await runTestSuite(runId, testPlanId, mode);
    }

    await completeTrace(traceId, {
      outputSummary: `${mode} test suite execution completed`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown execution error";
    await failTrace(traceId, msg);
    throw error;
  }
}

async function runReportingPhase(
  runId: string,
  projectId: string
): Promise<void> {
  const traceId = await startTrace({
    runId,
    projectId,
    agentPhase: "reporter",
    inputSummary: "Generate test run report and failure analysis",
  });

  try {
    await updateRunStatus(runId, "reporting", "Analyzing results");
    const { generateReport } = await import("@/services/reporting/reporter");
    await generateReport(runId);

    await completeTrace(traceId, {
      outputSummary: "Report generated with failure analysis and bug reports",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown reporting error";
    await failTrace(traceId, msg);
    throw error;
  }
}

async function finalizePipeline(
  runId: string,
  projectId: string,
  tokenBudget: TokenBudget
): Promise<PipelineResult> {
  const updatedRun = await updateRunStats(runId);
  await updateRunStatus(runId, "completed", "Run completed");

  const creditsConsumed = updatedRun.totalTests;
  await prisma.testRun.update({
    where: { id: runId },
    data: { creditsConsumed },
  });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true },
  });

  if (project) {
    await prisma.workspace.update({
      where: { id: project.workspaceId },
      data: { creditBalance: { decrement: creditsConsumed } },
    });
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { lastRunAt: new Date() },
  });

  return buildResult(runId, "completed", updatedRun, tokenBudget);
}

function buildResult(
  runId: string,
  status: "completed" | "failed" | "cancelled",
  run: { passed: number; failed: number; flaky: number; totalTests: number; durationMs: number | null },
  tokenBudget: TokenBudget
): PipelineResult {
  const usage = tokenBudget.getUsage();
  const agentUsage = tokenBudget.getAllAgentUsage();

  return {
    runId,
    status,
    passed: run.passed,
    failed: run.failed,
    flaky: run.flaky,
    totalTests: run.totalTests,
    durationMs: run.durationMs ?? 0,
    creditsConsumed: run.totalTests,
    tokenUsage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      byAgent: agentUsage,
    },
  };
}

async function shouldReindex(
  projectId: string,
  changedFiles?: string[]
): Promise<boolean> {
  if (changedFiles && changedFiles.length > 0) return true;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { lastIndexedAt: true },
  });

  if (!project?.lastIndexedAt) return true;

  const hoursSinceIndex =
    (Date.now() - project.lastIndexedAt.getTime()) / (1000 * 60 * 60);

  return hoursSinceIndex > 24;
}

export type { PipelineInput, PipelineResult };
