import { prisma } from "@/lib/db";
import type { RunTrigger } from "@/generated/prisma/client";
import { selectRunMode } from "./mode-selector";
import { TokenBudget } from "./token-budget";
import { getProjectContext } from "./context-manager";
import { createRun, updateRunStatus, updateRunStats } from "./run-manager";

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
}

interface PipelineResult {
  runId: string;
  status: "completed" | "failed";
  passed: number;
  failed: number;
  flaky: number;
  totalTests: number;
  durationMs: number;
  creditsConsumed: number;
  tokenUsage: { inputTokens: number; outputTokens: number };
}

export async function executePipeline(input: PipelineInput): Promise<PipelineResult> {
  const tokenBudget = new TokenBudget(
    input.maxTokenBudget ? { maxInputTokens: input.maxTokenBudget } : undefined
  );

  const context = await getProjectContext(input.projectId);

  const isFirstRun = context.lastRun === null;
  const { mode, reason } = selectRunMode({
    trigger: input.trigger,
    changedFiles: input.changedFiles,
    targetPaths: input.targetPaths,
    isFirstRun,
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
    // Phase 1: Indexing (if needed)
    await updateRunStatus(run.id, "indexing", reason);
    const needsReindex = await shouldReindex(input.projectId, input.changedFiles);

    if (needsReindex) {
      const branch = input.branch ?? context.project.defaultBranch;
      if (input.changedFiles && input.changedFiles.length > 0) {
        const { runIncrementalIndex } = await import("@/services/indexing/incremental");
        await runIncrementalIndex(input.projectId, branch, input.changedFiles);
      } else {
        const { runIndexingPipeline } = await import("@/services/indexing/pipeline");
        await runIndexingPipeline(input.projectId, branch);
      }
    }

    // Phase 2: Planning (if no active plan or mode requires it)
    await updateRunStatus(run.id, "planning", "Generating test plan");
    let testPlanId = context.activePlan?.id;

    if (!testPlanId || mode === "full") {
      const { generatePlan } = await import("@/services/planning/planner");
      const planResult = await generatePlan({ projectId: input.projectId, mode });
      testPlanId = planResult.plan.id;

      // Track token usage from planning
      tokenBudget.record(
        planResult.tokensUsed.input,
        planResult.tokensUsed.output
      );

      await prisma.testRun.update({
        where: { id: run.id },
        data: { testPlanId },
      });
    }

    // Check token budget before execution
    if (tokenBudget.isOverBudget()) {
      console.warn(`[Pipeline] Token budget exceeded before execution phase`);
    }

    // Phase 3: Execution
    await updateRunStatus(run.id, "executing", "Running tests");
    const { runTestSuite } = await import("@/services/execution/runner");
    await runTestSuite(run.id, testPlanId, mode);

    // Phase 4: Reporting
    await updateRunStatus(run.id, "reporting", "Analyzing results");
    const { generateReport } = await import("@/services/reporting/reporter");
    await generateReport(run.id);

    // Finalize
    const updatedRun = await updateRunStats(run.id);
    await updateRunStatus(run.id, "completed", "Run completed");

    const creditsConsumed = updatedRun.totalTests;
    await prisma.testRun.update({
      where: { id: run.id },
      data: { creditsConsumed },
    });

    // Deduct credits from workspace
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
      select: { workspaceId: true },
    });

    if (project) {
      await prisma.workspace.update({
        where: { id: project.workspaceId },
        data: { creditBalance: { decrement: creditsConsumed } },
      });
    }

    // Update project's last run timestamp
    await prisma.project.update({
      where: { id: input.projectId },
      data: { lastRunAt: new Date() },
    });

    return {
      runId: run.id,
      status: "completed",
      passed: updatedRun.passed,
      failed: updatedRun.failed,
      flaky: updatedRun.flaky,
      totalTests: updatedRun.totalTests,
      durationMs: updatedRun.durationMs ?? 0,
      creditsConsumed,
      tokenUsage: tokenBudget.getUsage(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Pipeline] Failed for project ${input.projectId}:`, errorMessage);

    await updateRunStatus(run.id, "failed", errorMessage);
    const updatedRun = await updateRunStats(run.id);

    return {
      runId: run.id,
      status: "failed",
      passed: updatedRun.passed,
      failed: updatedRun.failed,
      flaky: updatedRun.flaky,
      totalTests: updatedRun.totalTests,
      durationMs: updatedRun.durationMs ?? 0,
      creditsConsumed: updatedRun.totalTests,
      tokenUsage: tokenBudget.getUsage(),
    };
  }
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

  // Re-index if last indexed more than 24 hours ago
  const hoursSinceIndex =
    (Date.now() - project.lastIndexedAt.getTime()) / (1000 * 60 * 60);

  return hoursSinceIndex > 24;
}
