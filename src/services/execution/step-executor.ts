import type { Page } from "playwright";
import { createCompletion } from "@/lib/ai";
import { getModelForTask } from "@/lib/ai/model-router";
import { ExecutorActionSchema } from "@/agents/schemas/execution-result";
import type { ExecutorAction, StepResult } from "@/agents/schemas/execution-result";
import { buildExecutorPrompt } from "@/agents/prompts/executor-prompt";
import type { ExecutorContext } from "@/agents/prompts/executor-prompt";
import { getPageState } from "@/services/execution/browser-manager";
import type { PageState } from "@/services/execution/browser-manager";
import { healSelector, persistHealing } from "@/services/execution/self-healer";
import { performAction } from "@/services/execution/action-performer";
import type { EvidenceCollectorInstance } from "@/services/execution/evidence-collector";
import { isStagehandEnabled } from "@/services/execution/stagehand-adapter";
import { emitTestStep, emitTestScreenshot } from "@/lib/websocket";

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

async function getNextAction(context: ExecutorContext): Promise<ExecutorAction> {
  const model = getModelForTask("browser_execution");
  const prompt = buildExecutorPrompt(context);

  const result = await createCompletion({
    model,
    systemPrompt: prompt,
    messages: [{ role: "user", content: "Decide the next action." }],
    maxTokens: 500,
    temperature: 0,
  });

  return ExecutorActionSchema.parse(JSON.parse(result.content));
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

  const stepResults: StepResult[] = [];
  const healedSelectors: string[] = [];
  const previousActions: Array<{ action: string; result: string }> = [];

  let currentStepIndex = 0;
  let actionCount = 0;

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

    const action = await getNextAction(context);

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
    }

    previousActions.push({
      action: `${action.action}${action.selector ? ` ${action.selector}` : ""}`,
      result: result.actualResult,
    });

    if (!result.succeeded) {
      await evidenceCollector.captureScreenshot("failure");
      await evidenceCollector.captureDomSnapshot();
      return { steps: stepResults, verdict: "fail", healedSelectors };
    }

    if (action.action !== "wait" && action.action !== "screenshot") {
      currentStepIndex = Math.min(currentStepIndex + 1, steps.length - 1);
    }
  }

  return { steps: stepResults, verdict: "fail", healedSelectors };
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

  while (retries <= maxRetries) {
    try {
      actualResult = await performAction(page, action);
      succeeded = true;
      break;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      if (action.selector && errorMsg.includes("not found")) {
        const healing = await healSelector(
          page, projectId, action.selector, action.reason ?? action.action
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
