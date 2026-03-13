import type { Page } from "playwright";
import { createTrackedCompletion } from "@/lib/ai/tracked-completion";
import { getModelForTask } from "@/lib/ai/model-router";
import { ExecutorActionSchema } from "@/agents/schemas/execution-result";
import type { ExecutorAction, StepResult } from "@/agents/schemas/execution-result";
import { buildExecutorPrompt } from "@/agents/prompts/executor-prompt";
import type { ExecutorContext } from "@/agents/prompts/executor-prompt";
import { getPageState } from "@/services/execution/browser-manager";
import type { PageState } from "@/services/execution/browser-manager";
import { executeAction } from "@/services/execution/action-executor";
import { prisma } from "@/lib/db";
import type { EvidenceCollectorInstance } from "@/services/execution/evidence-collector";
import { isStagehandEnabled } from "@/services/execution/stagehand-adapter";
import { parseLlmJson } from "@/lib/utils/json-parse";
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

interface StepExecutorOptions {
  page: Page;
  projectId: string;
  testCaseId: string;
  testCaseName: string;
  runId?: string;
  steps: TestStep[];
  credentials: Record<string, string>;
  evidenceCollector: EvidenceCollectorInstance;
  maxRetries?: number;
  /** When true and USE_STAGEHAND env is set, uses Stagehand for action execution */
  useStagehand?: boolean;
}

interface StepExecutionResult {
  steps: StepResult[];
  verdict: "pass" | "fail" | "flaky" | "healed" | "environment_error";
  healedSelectors: string[];
}

export type { EvidenceCollectorInstance } from "@/services/execution/evidence-collector";

const MAX_ACTIONS_PER_TEST = 50;

// ============================================================
// LLM Decision Loop
// ============================================================

interface BillingInfo {
  workspaceId: string;
  projectId: string;
  runId?: string;
}

function stripNulls(obj: unknown): unknown {
  if (obj === null) return undefined;
  if (Array.isArray(obj)) return obj.map(stripNulls);
  if (typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => [k, stripNulls(v)])
    );
  }
  return obj;
}

const VALID_VERDICTS = new Set(["pass", "fail", "environment_error"]);

function normalizeAction(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.verdict && !VALID_VERDICTS.has(raw.verdict as string)) {
    const original = raw.verdict;
    raw = { ...raw, verdict: "fail", reason: raw.reason ?? `Non-standard verdict: ${original}` };
  }
  return raw;
}

async function getNextAction(
  context: ExecutorContext,
  billing: BillingInfo
): Promise<ExecutorAction> {
  const model = await getModelForTask("browser_execution");
  const prompt = buildExecutorPrompt(context);

  const result = await createTrackedCompletion(
    {
      model,
      systemPrompt: prompt,
      messages: [{ role: "user", content: "Decide the next action." }],
      maxTokens: 500,
      temperature: 0,
    },
    {
      workspaceId: billing.workspaceId,
      projectId: billing.projectId,
      runId: billing.runId,
      agentPhase: "executor",
    }
  );

  const cleaned = stripNulls(parseLlmJson(result.content)) as Record<string, unknown>;
  return ExecutorActionSchema.parse(normalizeAction(cleaned));
}

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

    if (action.action === "screenshot" || action.selector) {
      await evidenceCollector.captureScreenshot(`step-${currentStepIndex}`);
    }

    const result = await executeAction(
      page, projectId, action, maxRetries, evidenceCollector, runId
    );

    if (result.wasHealed) {
      healedSelectors.push(result.healedSelector);
    }

    const stepStatus = result.succeeded
      ? result.wasHealed ? "healed" : "passed"
      : "failed";

    stepResults.push({
      stepIndex: currentStepIndex,
      action: `${action.action}${action.selector ? ` on ${action.selector}` : ""}`,
      expected: steps[currentStepIndex]?.expected ?? action.reason ?? "",
      actual: result.actualResult,
      status: stepStatus,
      durationMs: result.durationMs,
      healedSelector: result.wasHealed ? result.healedSelector : undefined,
    });

    // Capture screenshot first so we can include the storage key in the step event
    if (runId) {
      const screenshotKey = await captureAndStream(
        page, runId, testCaseId, currentStepIndex, projectId
      );

      await emitTestStep(runId, {
        runId,
        testCaseId,
        stepIndex: currentStepIndex,
        action: `${action.action}${action.selector ? ` on ${action.selector}` : ""}`,
        status: result.succeeded ? "passed" : "failed",
        ...(screenshotKey ? { screenshotUrl: screenshotKey } : {}),
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

