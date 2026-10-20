import type { Page } from "playwright";
import type { StepResult } from "@/agents/schemas/execution-result";
import type { ExecutorContext } from "@/agents/prompts/executor-prompt";
import { getNextAction, type BillingInfo } from "@/services/execution/executor-decision";
import { loadMcpToolSession, performToolCall } from "@/services/execution/mcp-tool-step";
import { getPageState } from "@/services/execution/browser-manager";
import type { PageState } from "@/services/execution/browser-manager";
import { executeAction } from "@/services/execution/action-executor";
import { prisma } from "@/lib/db";
import type { EvidenceCollectorInstance } from "@/services/execution/evidence-collector";
import { isStagehandEnabled } from "@/services/execution/stagehand-adapter";
import { emitTestStep } from "@/lib/websocket";
import {
  captureAndStream,
  captureInitialState,
  captureFailureState,
} from "@/services/execution/screenshot-streamer";
import { maybeSkipAuthSteps } from "@/services/execution/auth-detector";

// ============================================================
// Types
// ============================================================

interface TestStep {
  action: string;
  expected: string;
  selectorHint?: string;
}

interface TestingNoteInput {
  content: string;
  category: "context" | "instruction" | "known-issue" | "credential-hint";
}

interface StepExecutorOptions {
  page: Page;
  projectId: string;
  testCaseId: string;
  testCaseName: string;
  runId?: string;
  steps: TestStep[];
  /** Environment base URL — used to resolve relative navigation targets */
  environmentUrl?: string;
  credentials: Record<string, string>;
  evidenceCollector: EvidenceCollectorInstance;
  maxRetries?: number;
  /** When true and USE_STAGEHAND env is set, uses Stagehand for action execution */
  useStagehand?: boolean;
  testingNotes?: TestingNoteInput[];
}

interface StepExecutionResult {
  steps: StepResult[];
  verdict: "pass" | "fail" | "flaky" | "healed" | "environment_error";
  healedSelectors: string[];
}

export type { EvidenceCollectorInstance } from "@/services/execution/evidence-collector";

const MAX_ACTIONS_PER_TEST = 50;

// ============================================================
// Step Executor
// ============================================================

export async function executeTestSteps(
  options: StepExecutorOptions
): Promise<StepExecutionResult> {
  const {
    page,
    projectId,
    testCaseId,
    testCaseName,
    runId,
    steps,
    credentials,
    evidenceCollector,
    maxRetries = 1,
    useStagehand = isStagehandEnabled(),
    testingNotes,
  } = options;

  // When Stagehand is enabled, delegate to Stagehand-powered execution
  if (useStagehand) {
    return executeWithStagehand(options);
  }

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { workspaceId: true },
  });
  const billing: BillingInfo = {
    workspaceId: project.workspaceId,
    projectId,
    runId,
  };

  const mcpTools = await loadMcpToolSession(project.workspaceId, runId);

  const stepResults: StepResult[] = [];
  const healedSelectors: string[] = [];
  const previousActions: Array<{ action: string; result: string }> = [];

  let currentStepIndex = 0;
  let actionCount = 0;

  // Capture initial browser state before first step
  if (runId) {
    await captureInitialState(page, runId, testCaseId, projectId);
  }

  // Pre-flight: skip login steps if page is already authenticated
  const skipResult = await maybeSkipAuthSteps(page, steps, testCaseName);
  if (skipResult.skipCount > 0) {
    console.log(`[StepExecutor] Skipping ${skipResult.skipCount} auth steps — page already authenticated`);
    for (let i = 0; i < skipResult.skipCount; i++) {
      stepResults.push({
        stepIndex: i,
        action: steps[i].action,
        expected: steps[i].expected,
        actual: "Skipped — page already authenticated",
        status: "passed",
        durationMs: 0,
      });
    }
    currentStepIndex = skipResult.skipCount;
  }

  while (actionCount < MAX_ACTIONS_PER_TEST) {
    actionCount++;

    let pageState: PageState;
    try {
      pageState = await getPageState(page);
    } catch {
      stepResults.push({
        stepIndex: currentStepIndex,
        action: "get_page_state",
        expected: "Page state retrieved",
        actual: "Failed to get page state",
        status: "failed",
        durationMs: 0,
      });
      break;
    }

    const context: ExecutorContext = {
      testCaseId,
      testCaseName,
      currentStepIndex,
      steps: steps.map((s) => ({
        action: s.action,
        expected: s.expected,
        selectorHint: s.selectorHint,
      })),
      pageState,
      screenshotDescription: `Step ${currentStepIndex + 1} of ${steps.length}`,
      previousActions,
      testCredentials: credentials,
      testingNotes,
      mcpToolsPrompt: mcpTools.prompt || undefined,
    };

    const action = await getNextAction(context, billing);

    if (action.action === "verdict") {
      let verdictValue: StepExecutionResult["verdict"] =
        action.verdict === "pass" ? "pass"
        : action.verdict === "environment_error" ? "environment_error"
        : "fail";
      if (verdictValue === "pass" && healedSelectors.length > 0) {
        verdictValue = "healed";
      }
      return {
        steps: stepResults,
        verdict: verdictValue,
        healedSelectors,
      };
    }

    // MCP tool calls support the current step without advancing it
    if (action.action === "tool_call") {
      const expected = steps[currentStepIndex]?.expected ?? action.reason ?? "";
      const { step, history } = await performToolCall(mcpTools, action, currentStepIndex, expected);
      stepResults.push(step);
      previousActions.push(history);
      continue;
    }

    if (action.action === "screenshot" || action.selector) {
      await evidenceCollector.captureScreenshot(`step-${currentStepIndex}`);
    }

    const result = await executeAction(
      page, projectId, action, maxRetries, evidenceCollector, runId,
      options.environmentUrl
    );

    if (result.wasHealed) {
      healedSelectors.push(result.healedSelector);
    }

    const stepStatus = result.succeeded
      ? result.wasHealed ? "healed" : "passed"
      : "failed";

    console.log(
      `[StepExecutor:${testCaseId.slice(0, 8)}] step ${currentStepIndex} ${action.action}${action.selector ? ` "${action.selector}"` : ""} -> ${stepStatus} (${result.actualResult.slice(0, 120)})`
    );

    stepResults.push({
      stepIndex: currentStepIndex,
      action: `${action.action}${action.selector ? ` on ${action.selector}` : ""}`,
      expected: steps[currentStepIndex]?.expected ?? action.reason ?? "",
      actual: result.actualResult,
      status: stepStatus,
      durationMs: result.durationMs,
      healedSelector: result.wasHealed ? result.healedSelector : undefined,
    });

    // Capture screenshot first so the step event can carry its URL
    if (runId) {
      const screenshot = await captureAndStream(
        page, runId, testCaseId, currentStepIndex, projectId
      );

      await emitTestStep(runId, {
        runId,
        testCaseId,
        stepIndex: currentStepIndex,
        action: `${action.action}${action.selector ? ` on ${action.selector}` : ""}`,
        status: result.succeeded ? "passed" : "failed",
        ...(screenshot?.url ? { screenshotUrl: screenshot.url } : {}),
      });
    }

    previousActions.push({
      action: `${action.action}${action.selector ? ` ${action.selector}` : ""}`,
      result: result.actualResult,
    });

    if (!result.succeeded) {
      await evidenceCollector.captureScreenshot("failure");
      await evidenceCollector.captureDomSnapshot();
      if (runId) {
        await captureFailureState(page, runId, testCaseId, currentStepIndex, projectId);
      }
      return { steps: stepResults, verdict: "fail", healedSelectors };
    }

    if (action.action !== "wait" && action.action !== "screenshot") {
      currentStepIndex++;
      if (currentStepIndex >= steps.length) {
        const verdict = healedSelectors.length > 0 ? "healed" : "pass";
        return { steps: stepResults, verdict, healedSelectors };
      }
    }
  }

  // Hit the action limit without a verdict — treat as fail
  return { steps: stepResults, verdict: "fail", healedSelectors };
}

// Stagehand-powered execution lives in stagehand-adapter.ts
async function executeWithStagehand(
  options: StepExecutorOptions
): Promise<StepExecutionResult> {
  const { executeStagehandSteps } = await import("./stagehand-adapter");
  return executeStagehandSteps(options.steps, options.evidenceCollector);
}

