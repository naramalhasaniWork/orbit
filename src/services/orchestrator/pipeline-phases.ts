import { prisma } from "@/lib/db";
import type { RunMode } from "@/generated/prisma/client";
import { TokenBudget } from "./token-budget";
import { getProjectContext } from "./context-manager";
import { updateRunStatus } from "./run-manager";
import { startTrace, completeTrace, failTrace } from "@/services/tracing";
import type { OperationsMap } from "@/agents/schemas/operations-map";

// Individual pipeline phases. The orchestration (ordering, cancellation,
// terminal status) lives in pipeline.ts.

export async function runIndexingPhase(
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

export async function runAuditPhase(runId: string, projectId: string): Promise<void> {
  // Audit runs silently between indexing and planning — no status transition needed.
  // The planning phase will update status to "planning" when it starts.
  try {
    const { runCodeAudit } = await import("@/services/auditing/auditor");
    await runCodeAudit({ projectId, runId });
  } catch (error) {
    // Audit is non-blocking — log and continue
    console.warn("[Pipeline] Code audit failed, continuing:", error);
  }
}

export async function runOperationsAnalysisPhase(
  runId: string,
  projectId: string,
  tokenBudget: TokenBudget
): Promise<OperationsMap | undefined> {
  const traceId = await startTrace({
    runId,
    projectId,
    agentPhase: "planner",
    inputSummary: "Analyze business operations and dependencies",
  });

  try {
    const { analyzeOperations } = await import("@/services/planning/operations-analyzer");
    const result = await analyzeOperations(projectId);

    tokenBudget.record(
      result.tokensUsed.input,
      result.tokensUsed.output,
      0,
      "planner"
    );

    await completeTrace(traceId, {
      outputSummary: `Identified ${result.operationsMap.metadata.totalOperations} operations in ${result.operationsMap.metadata.totalFlows} flows`,
      inputTokens: result.tokensUsed.input,
      outputTokens: result.tokensUsed.output,
    });

    return result.operationsMap;
  } catch (error) {
    // Operations analysis is non-blocking — log and continue without it
    const msg = error instanceof Error ? error.message : "Unknown operations analysis error";
    console.warn("[Pipeline] Operations analysis failed, continuing:", msg);
    await failTrace(traceId, msg);
    return undefined;
  }
}

export async function runPlanningPhase(
  runId: string,
  projectId: string,
  mode: RunMode,
  existingPlanId: string | undefined,
  tokenBudget: TokenBudget,
  operationsMap?: OperationsMap
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
    const planResult = await generatePlan({ projectId, mode, operationsMap });

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

export async function runExecutionPhase(
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
    // sequential for targeted/regression runs or when an admin disabled it
    const { getFlag } = await import("@/lib/system-config");
    if ((mode === "full" || mode === "smoke") && (await getFlag("parallel_execution"))) {
      const { runTestSuiteParallel } = await import("@/services/execution/runner");
      await runTestSuiteParallel(runId, testPlanId, mode);
    } else {
      const { runTestSuite } = await import("@/services/execution/runner");
      await runTestSuite(runId, testPlanId, mode);
    }

    // The runner records its own fatal outcomes (bad environment, browser
    // or AI provider down) on the run and returns normally — don't let the
    // pipeline report and "complete" a run the runner already failed.
    const after = await prisma.testRun.findUnique({
      where: { id: runId },
      select: { status: true, summary: true },
    });
    if (after?.status === "failed") {
      throw new Error(after.summary ?? "Execution failed");
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

export async function runReportingPhase(
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
