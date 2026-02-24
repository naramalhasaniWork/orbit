import type { Page } from "playwright";
import { createTrackedCompletion } from "@/lib/ai/tracked-completion";
import { getModelForTask } from "@/lib/ai/model-router";
import { ExecutorActionSchema } from "@/agents/schemas/execution-result";
import type { ExecutorAction, StepResult } from "@/agents/schemas/execution-result";
import { buildExecutorPrompt } from "@/agents/prompts/executor-prompt";
import type { ExecutorContext } from "@/agents/prompts/executor-prompt";
import { getPageState } from "@/services/execution/browser-manager";
import type { PageState } from "@/services/execution/browser-manager";
import { healSelector, persistHealing } from "@/services/execution/self-healer";
import { performAction } from "@/services/execution/action-performer";
import { prisma } from "@/lib/db";
import type { EvidenceCollectorInstance } from "@/services/execution/evidence-collector";
import { isStagehandEnabled } from "@/services/execution/stagehand-adapter";
import { parseLlmJson } from "@/lib/utils/json-parse";
import { emitTestStep, emitTestScreenshot } from "@/lib/websocket";
import {
  captureAndStream,
  captureInitialState,
  captureFailureState,
} from "@/services/execution/screenshot-streamer";

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
  verdict: "pass" | "fail" | "flaky" | "healed";
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

  return ExecutorActionSchema.parse(stripNulls(parseLlmJson(result.content)));
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
      return {
        steps: stepResults,
        verdict: action.verdict === "pass" ? "pass" : "fail",
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

    // Emit real-time step event
    if (runId) {
      await emitTestStep(runId, {
        runId,
        testCaseId,
        stepIndex: currentStepIndex,
        action: `${action.action}${action.selector ? ` on ${action.selector}` : ""}`,
        status: result.succeeded ? "passed" : "failed",
      });

      // Stream screenshot after each action for live viewer
      await captureAndStream(page, runId, testCaseId, currentStepIndex, projectId);
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
      // All steps completed without a verdict action — treat as pass
      if (currentStepIndex >= steps.length) {
        return { steps: stepResults, verdict: "pass", healedSelectors };
      }
    }
  }

  // Hit the action limit without a verdict — treat as fail
  return { steps: stepResults, verdict: "fail", healedSelectors };
}

// ============================================================
// Selector Memory Pre-Application
// ============================================================

async function resolveSelector(
  projectId: string,
  originalSelector: string
): Promise<string> {
  const mapping = await prisma.selectorMapping.findFirst({
    where: {
      projectId,
      originalSelector,
      confidence: { gte: 0.85 },
    },
    orderBy: { healCount: "desc" },
  });

  return mapping?.healedSelector ?? originalSelector;
}

// ============================================================
// Action Execution with Retry + Self-Healing
// ============================================================

interface ActionResult {
  succeeded: boolean;
  actualResult: string;
  durationMs: number;
  wasHealed: boolean;
  healedSelector: string;
}

async function executeAction(
  page: Page,
  projectId: string,
  action: ExecutorAction,
  maxRetries: number,
  _evidenceCollector: EvidenceCollectorInstance,
  runId?: string
): Promise<ActionResult> {
  const startTime = Date.now();
  let retries = 0;
  let succeeded = false;
  let actualResult = "";
  let wasHealed = false;
  let healedSelector = "";

  // Pre-apply known-good selector from history before attempting action
  if (action.selector) {
    const resolved = await resolveSelector(projectId, action.selector);
    if (resolved !== action.selector) {
      action = { ...action, selector: resolved };
      wasHealed = true;
      healedSelector = resolved;
    }
  }

  while (retries <= maxRetries) {
    try {
      actualResult = await performAction(page, action);
      succeeded = true;
      break;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      if (action.selector && errorMsg.includes("not found")) {
        const healing = await healSelector(
          page, projectId, action.selector, action.reason ?? action.action, runId
        );

        if (healing.found) {
          try {
            const healedAction = { ...action, selector: healing.healedSelector };
            actualResult = await performAction(page, healedAction);
            const pageUrl = page.url();
            await persistHealing(
              projectId, action.selector, healing.healedSelector, healing.confidence,
              runId, pageUrl
            );
            healedSelector = healing.healedSelector;
            wasHealed = true;
            succeeded = true;
            break;
          } catch {
            // Healed selector also failed
          }
        }
      }

      retries++;
      if (retries <= maxRetries) {
        await page.waitForTimeout(1000);
      } else {
        actualResult = errorMsg;
      }
    }
  }

  return {
    succeeded,
    actualResult,
    durationMs: Date.now() - startTime,
    wasHealed,
    healedSelector,
  };
}

// Stagehand-powered execution lives in stagehand-adapter.ts
async function executeWithStagehand(
  options: StepExecutorOptions
): Promise<StepExecutionResult> {
  const { executeStagehandSteps } = await import("./stagehand-adapter");
  return executeStagehandSteps(options.steps, options.evidenceCollector);
}
