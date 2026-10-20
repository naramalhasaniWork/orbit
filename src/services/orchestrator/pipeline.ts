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
import { canConsume } from "@/lib/auth/tenant";
import { ShutdownError } from "@/lib/queue/shutdown";
import type { OperationsMap } from "@/agents/schemas/operations-map";
import {
  runIndexingPhase,
  runAuditPhase,
  runOperationsAnalysisPhase,
  runPlanningPhase,
  runExecutionPhase,
  runReportingPhase,
} from "./pipeline-phases";

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

type ProjectContext = Awaited<ReturnType<typeof getProjectContext>>;
type ModeSelection = ReturnType<typeof selectRunMode>;

/** Create a run and drive it through the pipeline (scheduler entry point). */
export async function executePipeline(
  input: PipelineInput
): Promise<PipelineResult> {
  const context = await getProjectContext(input.projectId);

  const selection = selectRunMode({
    trigger: input.trigger,
    changedFiles: input.changedFiles,
    targetPaths: input.targetPaths,
    isFirstRun: context.lastRun === null,
    requestedMode: input.requestedMode,
  });

  const run = await createRun({
    projectId: input.projectId,
    environmentId: context.defaultEnvironment?.id,
    testPlanId: context.activePlan?.id,
    mode: selection.mode,
    trigger: input.trigger,
    triggeredById: input.triggeredById,
    branch: input.branch,
    commitSha: input.commitSha,
    prNumber: input.prNumber,
  });

  return runPipeline(run.id, input, context, selection);
}

/**
 * Drive an already-created run (webhooks, Slack, mentions) through
 * index → plan → execute → report. The run's stored mode is honoured.
 */
export async function executePipelineForRun(
  runId: string,
  options: { changedFiles?: string[] } = {}
): Promise<PipelineResult> {
  const run = await prisma.testRun.findUniqueOrThrow({
    where: { id: runId },
    select: {
      projectId: true, mode: true, trigger: true, branch: true, commitSha: true,
      prNumber: true, triggeredById: true, environmentId: true, testPlanId: true, status: true,
    },
  });
  const context = await getProjectContext(run.projectId);

  // Event-triggered runs are created before we know the project's defaults
  const environmentId = run.environmentId ?? context.defaultEnvironment?.id;
  const testPlanId = run.testPlanId ?? context.activePlan?.id;
  if (environmentId !== run.environmentId || testPlanId !== run.testPlanId) {
    await prisma.testRun.update({ where: { id: runId }, data: { environmentId, testPlanId } });
  }

  const input: PipelineInput = {
    projectId: run.projectId,
    trigger: run.trigger,
    triggeredById: run.triggeredById ?? undefined,
    branch: run.branch ?? undefined,
    commitSha: run.commitSha ?? undefined,
    prNumber: run.prNumber ?? undefined,
    changedFiles: options.changedFiles,
    requestedMode: run.mode,
  };
  const selection = selectRunMode({
    trigger: run.trigger,
    changedFiles: options.changedFiles,
    requestedMode: run.mode,
  });

  // A retried job (shutdown, stalled worker) finds the run already executing:
  // skip straight to execution, where recorded cases are skipped.
  const resuming = run.status === "executing" && !!run.testPlanId;
  return runPipeline(runId, input, context, selection, resuming ? run.testPlanId : undefined);
}

async function runPipeline(
  runId: string,
  input: PipelineInput,
  context: ProjectContext,
  selection: ModeSelection,
  resumeTestPlanId?: string | null
): Promise<PipelineResult> {
  const { mode, reason, skipIndexing, skipPlanning } = selection;
  const tokenBudget = new TokenBudget(
    input.maxTokenBudget
      ? { maxInputTokens: input.maxTokenBudget }
      : undefined
  );

  try {
    // Credits may have run out while the run was queued
    const allowance = await canConsume(context.project.workspaceId, "credits");
    if (!allowance.allowed) throw new Error(allowance.reason);

    let testPlanId = resumeTestPlanId ?? context.activePlan?.id;
    if (!resumeTestPlanId) {
      // Phase 1: Indexing
      await checkCancellation(runId);

      if (!skipIndexing) {
        await runIndexingPhase(
          runId, input.projectId, input.branch, input.changedFiles, context, reason
        );
      }

      // Phase 1.5: Code Audit (full runs only)
      if (mode === "full") {
        await checkCancellation(runId);
        await runAuditPhase(runId, input.projectId);
      }

      // Phase 1.75: Operations Analysis (full/manual runs only)
      let operationsMap: OperationsMap | undefined;
      if (mode === "full") {
        await checkCancellation(runId);
        operationsMap = await runOperationsAnalysisPhase(
          runId, input.projectId, tokenBudget
        );
      }

      // Phase 2: Planning
      await checkCancellation(runId);

      if (!skipPlanning || !testPlanId) {
        testPlanId = await runPlanningPhase(
          runId, input.projectId, mode, testPlanId, tokenBudget, operationsMap
        );
      }
    }

    if (!testPlanId) throw new Error("No test plan available for execution");

    // Check budget after planning — hard stop before execution to avoid runaway costs
    if (tokenBudget.isOverBudget()) {
      throw new Error(
        `Token budget exceeded after planning (input: ${tokenBudget.getUsage().inputTokens.toLocaleString()} tokens). ` +
        `Increase maxTokenBudget or reduce the system map size.`
      );
    }

    // Phase 3: Execution
    await checkCancellation(runId);
    await runExecutionPhase(runId, input.projectId, testPlanId, mode);

    // Phase 4: Reporting
    await checkCancellation(runId);
    await runReportingPhase(runId, input.projectId);

    // Finalize
    return await finalizePipeline(runId, input.projectId, tokenBudget);
  } catch (error) {
    // Retryable: leave the run active so the retried job resumes it
    if (error instanceof ShutdownError) throw error;
    if (error instanceof PipelineCancelledError) {
      const updatedRun = await updateRunStats(runId);
      return buildResult(runId, "cancelled", updatedRun, tokenBudget);
    }

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[Pipeline] Failed for project ${input.projectId}:`,
      errorMessage
    );

    await updateRunStatus(runId, "failed", errorMessage);
    const updatedRun = await updateRunStats(runId);
    return buildResult(runId, "failed", updatedRun, tokenBudget);
  }
}

async function finalizePipeline(
  runId: string,
  projectId: string,
  tokenBudget: TokenBudget
): Promise<PipelineResult> {
  const updatedRun = await updateRunStats(runId);
  await updateRunStatus(runId, "completed", "Run completed");

  // Credits are charged once, by the runner, when execution completes
  await prisma.project.update({
    where: { id: projectId },
    data: { lastRunAt: new Date() },
  });

  return buildResult(runId, "completed", updatedRun, tokenBudget);
}

function buildResult(
  runId: string,
  status: "completed" | "failed" | "cancelled",
  run: {
    passed: number; failed: number; flaky: number; totalTests: number;
    durationMs: number | null; creditsConsumed: number;
  },
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
    creditsConsumed: run.creditsConsumed,
    tokenUsage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      byAgent: agentUsage,
    },
  };
}

export type { PipelineInput, PipelineResult };
