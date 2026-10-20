/**
 * Orbit Agent Tools — each wraps an existing service and returns structured
 * data that the LLM can summarize in natural language.
 */

import { prisma } from "@/lib/db";
import type { ToolDefinition } from "@/server/ai/types";
import { ENVIRONMENT_TOOLS, environmentHandlers, listProjectEnvironments } from "./environments";

// ============================================================
// Tool Context (passed to every tool execution)
// ============================================================

interface ToolContext {
  projectId: string;
  workspaceId: string;
  userId: string;
}

type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolContext
) => Promise<unknown>;

// ============================================================
// Tool Definitions (Anthropic format)
// ============================================================

export const ORBIT_TOOLS: ToolDefinition[] = [
  {
    name: "get_project_status",
    description:
      "Get the current status of this project: index state, active test plan, last run results, system map stats, and agent memory (trends, flaky tests, failure patterns).",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "index_repository",
    description:
      "Trigger repository indexing/re-indexing. This is a long operation (30-120s) that runs in the background. Returns a job ID to check status later.",
    input_schema: {
      type: "object",
      properties: {
        branch: {
          type: "string",
          description: "Branch to index. Defaults to the project's default branch.",
        },
        incremental: {
          type: "boolean",
          description: "If true, only index changed files. Default false (full re-index).",
        },
      },
      required: [],
    },
  },
  {
    name: "generate_test_plan",
    description:
      "Start generating (or regenerating) the test plan from the current system map. Runs in the background for a few minutes; returns a job ID, and progress shows on the Test Plans page.",
    input_schema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["full", "smoke", "regression", "targeted"],
          description: "Test plan mode. Default: full.",
        },
      },
      required: [],
    },
  },
  {
    name: "run_tests",
    description:
      "Start a test run against the project's run environment (see list_environments). This is a long operation (1-10min) that runs in the background. Returns a run ID.",
    input_schema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["full", "smoke", "regression", "targeted"],
          description: "Test mode. Default: smoke.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_test_results",
    description:
      "Get results for a specific test run or the most recent run. Includes pass/fail counts and individual test result summaries.",
    input_schema: {
      type: "object",
      properties: {
        runId: {
          type: "string",
          description: "Specific run ID. If omitted, returns the most recent run.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_system_map",
    description:
      "Search the system map (codebase structure) using a semantic query. Returns matching routes, components, endpoints, and their relationships.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Semantic search query (e.g. 'authentication flow', 'payment endpoints').",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "explain_failure",
    description:
      "Get a detailed explanation of why a specific test failed, including root cause analysis and suggested fixes.",
    input_schema: {
      type: "object",
      properties: {
        testResultId: {
          type: "string",
          description: "The test result ID to explain.",
        },
      },
      required: ["testResultId"],
    },
  },
  {
    name: "cancel_run",
    description:
      "Cancel an in-progress test run.",
    input_schema: {
      type: "object",
      properties: {
        runId: {
          type: "string",
          description: "The run ID to cancel.",
        },
      },
      required: ["runId"],
    },
  },
  ...ENVIRONMENT_TOOLS,
];

// ============================================================
// Tool Handlers
// ============================================================

const handlers: Record<string, ToolHandler> = {
  ...environmentHandlers,
  get_project_status: async (_args, ctx) => {
    const { getProjectContext } = await import("@/services/orchestrator/context-manager");
    const { getMemorySnapshot } = await import("@/services/orchestrator/agent-memory");

    const [context, memory, environments] = await Promise.all([
      getProjectContext(ctx.projectId),
      getMemorySnapshot(ctx.projectId, 5),
      listProjectEnvironments(ctx.projectId, ctx.workspaceId),
    ]);

    return {
      project: {
        name: context.project.name,
        framework: context.project.framework,
        lastIndexedAt: context.project.lastIndexedAt,
        lastRunAt: context.project.lastRunAt,
        healthStatus: context.project.healthStatus,
      },
      systemMap: context.systemMapStats,
      activePlan: context.activePlan,
      lastRun: context.lastRun,
      environments,
      memory: {
        averagePassRate: memory.averagePassRate,
        totalRuns: memory.totalRuns,
        flakyPatterns: memory.flakyPatterns.slice(0, 3),
        failurePatterns: memory.failurePatterns.slice(0, 3),
      },
    };
  },

  index_repository: async (args, ctx) => {
    const { getIndexingQueue } = await import("@/lib/queue/queues");

    const project = await prisma.project.findUniqueOrThrow({
      where: { id: ctx.projectId },
      select: { defaultBranch: true },
    });

    const branch = (args.branch as string) || project.defaultBranch;
    const isIncremental = (args.incremental as boolean) ?? false;

    const queue = getIndexingQueue();
    const job = await queue.add(`index-${ctx.projectId}`, {
      projectId: ctx.projectId,
      branch,
      isIncremental,
    });

    return {
      jobId: job.id,
      status: "started",
      branch,
      isIncremental,
      message: `Repository indexing started on branch "${branch}". This typically takes 30-120 seconds.`,
    };
  },

  generate_test_plan: async (args, ctx) => {
    const { enqueuePlanGeneration } = await import("@/services/planning/plan-jobs");
    const mode = (args.mode as string) || "full";

    // Generation takes minutes; queue it rather than holding the chat turn.
    const { state, alreadyRunning } = await enqueuePlanGeneration(ctx.projectId, {
      mode: mode as "full" | "smoke" | "regression" | "targeted",
    });

    const message = alreadyRunning
      ? "A plan generation is already in progress. Progress is on the Test Plans page."
      : "Plan generation started in the background; it usually takes a few minutes. Progress is on the Test Plans page.";
    return { jobId: state.jobId, status: state.status, alreadyRunning, message };
  },

  run_tests: async (args, ctx) => {
    const { createRun } = await import("@/services/orchestrator/run-manager");
    const { getDefaultEnvironment } = await import(
      "@/services/execution/environment-validator"
    );

    const mode = (args.mode as string) || "smoke";

    const environmentId = await getDefaultEnvironment(ctx.projectId);
    if (!environmentId) {
      return { error: "No staging environment configured. Add one in project settings first." };
    }

    const activePlan = await prisma.testPlan.findFirst({
      where: { projectId: ctx.projectId, isActive: true },
      select: { id: true },
      orderBy: { version: "desc" },
    });

    if (!activePlan) {
      return { error: "No active test plan found. Generate a test plan first." };
    }

    const run = await createRun({
      projectId: ctx.projectId,
      environmentId,
      testPlanId: activePlan.id,
      mode: mode as "full" | "smoke" | "regression" | "targeted",
      trigger: "api",
      triggeredById: ctx.userId,
    });

    // Enqueue execution
    const { getExecutionQueue } = await import("@/lib/queue/queues");
    const environment = await prisma.environment.findUnique({
      where: { id: environmentId },
      select: { url: true },
    });
    const queue = getExecutionQueue();
    await queue.add(`run-${run.id}`, {
      runId: run.id,
      testCaseId: "__full_run__",
      environmentUrl: environment?.url ?? "",
      environmentId,
    });

    return {
      runId: run.id,
      status: "queued",
      mode,
      message: `Test run started in ${mode} mode. This typically takes 1-10 minutes.`,
    };
  },

  get_test_results: async (args, ctx) => {
    const runId = args.runId as string | undefined;

    const run = runId
      ? await prisma.testRun.findUnique({
          where: { id: runId },
          include: {
            results: {
              include: { testCase: { select: { name: true, type: true, journey: true } } },
              orderBy: { createdAt: "asc" },
              take: 50,
            },
          },
        })
      : await prisma.testRun.findFirst({
          where: { projectId: ctx.projectId },
          orderBy: { createdAt: "desc" },
          include: {
            results: {
              include: { testCase: { select: { name: true, type: true, journey: true } } },
              orderBy: { createdAt: "asc" },
              take: 50,
            },
          },
        });

    if (!run) {
      return { error: "No test runs found for this project." };
    }

    return {
      runId: run.id,
      status: run.status,
      mode: run.mode,
      totalTests: run.totalTests,
      passed: run.passed,
      failed: run.failed,
      flaky: run.flaky,
      skipped: run.skipped,
      durationMs: run.durationMs,
      completedAt: run.completedAt?.toISOString() ?? null,
      results: run.results.map((r) => ({
        id: r.id,
        testName: r.testCase.name,
        journey: r.testCase.journey,
        type: r.testCase.type,
        verdict: r.verdict,
        durationMs: r.durationMs,
        failureExplanation: r.failureExplanation,
      })),
    };
  },

  get_system_map: async (args, ctx) => {
    const { retrieveAgentContext } = await import("@/services/orchestrator/context-manager");
    const query = args.query as string;

    const nodes = await retrieveAgentContext(ctx.projectId, "planner", query);

    return {
      query,
      matchCount: nodes.length,
      nodes: nodes.map((n) => ({
        type: n.type,
        name: n.name,
        filePath: n.filePath,
        similarity: Math.round(n.similarity * 100) / 100,
      })),
    };
  },

  explain_failure: async (args, ctx) => {
    const testResultId = args.testResultId as string;

    const result = await prisma.testResult.findUnique({
      where: { id: testResultId },
      include: {
        testCase: { select: { name: true, type: true, journey: true, steps: true } },
        testRun: { select: { id: true, mode: true } },
      },
    });

    if (!result) {
      return { error: "Test result not found." };
    }

    // If we already have a failure explanation, return it
    if (result.failureExplanation) {
      return {
        testName: result.testCase.name,
        verdict: result.verdict,
        explanation: result.failureExplanation,
        suggestedFix: result.suggestedFix,
      };
    }

    // Otherwise, generate one using the reporter
    const { complete } = await import("@/server/ai/gateway");
    const { getModelForTask } = await import("@/lib/ai/model-router");
    const model = await getModelForTask("failure_analysis", ctx.workspaceId);

    const completion = await complete({
      model,
      system: "You are a test failure analyst. Explain why this test failed and suggest a fix.",
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            testName: result.testCase.name,
            journey: result.testCase.journey,
            verdict: result.verdict,
            steps: result.steps,
            executedSteps: result.steps,
          }),
        },
      ],
      maxTokens: 1024,
      temperature: 0.2,
    }, {
      workspaceId: ctx.workspaceId,
      projectId: ctx.projectId,
      runId: result.testRun.id,
      agentPhase: "reporter",
    });

    return {
      testName: result.testCase.name,
      verdict: result.verdict,
      explanation: completion.content,
      suggestedFix: result.suggestedFix,
    };
  },

  cancel_run: async (args, _ctx) => {
    const { cancelRun } = await import("@/services/orchestrator/run-manager");
    const runId = args.runId as string;
    const cancelled = await cancelRun(runId);
    return { runId, cancelled };
  },
};

// ============================================================
// Tool Executor
// ============================================================

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const handler = handlers[toolName];
  if (!handler) {
    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }

  try {
    const result = await handler(args, ctx);
    return JSON.stringify(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool execution failed";
    return JSON.stringify({ error: message });
  }
}

export type { ToolContext };
