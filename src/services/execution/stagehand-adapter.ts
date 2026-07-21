/**
 * Stagehand adapter — wraps @browserbasehq/stagehand v3.
 *
 * Stagehand provides:
 * - Built-in prompt caching (reduces LLM calls for repeated element lookups)
 * - Element caching (remembers selectors across actions in the same session)
 * - Self-healing selectors via vision + DOM analysis
 *
 * When USE_STAGEHAND=true and BROWSERBASE_API_KEY is set, Stagehand
 * connects through Browserbase cloud browsers instead of local Playwright.
 */

import { getModelForTask } from "@/lib/ai/model-router";

interface StagehandConfig {
  apiKey?: string;
  projectId?: string;
  modelName?: string;
  verbose?: boolean;
}

interface ActResult {
  success: boolean;
  message: string;
  action: string;
}

interface ObserveResult {
  elements: Array<{ selector: string; description: string }>;
}

export interface StagehandInstance {
  act: (action: string) => Promise<ActResult>;
  observe: (instruction?: string) => Promise<ObserveResult>;
  close: () => Promise<void>;
}

export async function createStagehandSession(
  config: StagehandConfig = {}
): Promise<StagehandInstance> {
  const browserbaseApiKey = config.apiKey ?? process.env.BROWSERBASE_API_KEY;
  if (!browserbaseApiKey) {
    throw new Error(
      "[Stagehand] BROWSERBASE_API_KEY is not set. " +
      "Stagehand requires a Browserbase API key. Set BROWSERBASE_API_KEY in your environment or pass it via config.apiKey."
    );
  }

  const { Stagehand } = await import("@browserbasehq/stagehand");

  const projectId = config.projectId ?? process.env.BROWSERBASE_PROJECT_ID;
  const model = config.modelName ?? (await getModelForTask("browser_execution"));

  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    apiKey: browserbaseApiKey,
    projectId,
    verbose: (config.verbose ? 1 : 0) as 0 | 1 | 2,
    model: model as "gpt-4.1",
  });

  await stagehand.init();

  return {
    async act(action: string): Promise<ActResult> {
      const result = await stagehand.act(action);
      return {
        success: result.success,
        message: result.message ?? `Performed: ${action}`,
        action,
      };
    },

    async observe(instruction?: string): Promise<ObserveResult> {
      const result = instruction
        ? await stagehand.observe(instruction)
        : await stagehand.observe();
      return {
        elements: result.map((el) => ({
          selector: el.selector,
          description: el.description,
        })),
      };
    },

    async close(): Promise<void> {
      await stagehand.close();
    },
  };
}

export function isStagehandEnabled(): boolean {
  // Requires Browserbase — USE_STAGEHAND alone would route every test
  // into a session that throws before executing a single step
  const wanted = process.env.USE_STAGEHAND === "true";
  if (wanted && !process.env.BROWSERBASE_API_KEY) {
    console.warn(
      "[Stagehand] USE_STAGEHAND=true but BROWSERBASE_API_KEY is not set — falling back to native executor"
    );
    return false;
  }
  return wanted;
}

export function isBrowserbaseEnabled(): boolean {
  return !!process.env.BROWSERBASE_API_KEY;
}

// ============================================================
// Step execution via Stagehand
// ============================================================

interface TestStep {
  action: string;
  expected: string;
}

interface StepResult {
  stepIndex: number;
  action: string;
  expected: string;
  actual: string;
  status: "passed" | "failed" | "skipped" | "healed";
  durationMs: number;
  healedSelector?: string;
  screenshotUrl?: string;
}

interface StepExecutionResult {
  steps: StepResult[];
  verdict: "pass" | "fail" | "flaky" | "healed";
  healedSelectors: string[];
}

interface EvidenceCollector {
  captureScreenshot: (label: string) => Promise<string | void>;
}

export async function executeStagehandSteps(
  steps: TestStep[],
  evidenceCollector: EvidenceCollector
): Promise<StepExecutionResult> {
  const stepResults: StepResult[] = [];
  let session: StagehandInstance | null = null;

  try {
    session = await createStagehandSession();

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const startTime = Date.now();

      try {
        const result = await session.act(
          `${step.action}. Expected outcome: ${step.expected}`
        );

        await evidenceCollector.captureScreenshot(`stagehand-step-${i}`);

        stepResults.push({
          stepIndex: i,
          action: step.action,
          expected: step.expected,
          actual: result.message,
          status: result.success ? "passed" : "failed",
          durationMs: Date.now() - startTime,
        });

        if (!result.success) {
          return { steps: stepResults, verdict: "fail", healedSelectors: [] };
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await evidenceCollector.captureScreenshot("stagehand-failure");

        stepResults.push({
          stepIndex: i,
          action: step.action,
          expected: step.expected,
          actual: errorMsg,
          status: "failed",
          durationMs: Date.now() - startTime,
        });

        return { steps: stepResults, verdict: "fail", healedSelectors: [] };
      }
    }

    return { steps: stepResults, verdict: "pass", healedSelectors: [] };
  } finally {
    if (session) {
      await session.close().catch(() => {});
    }
  }
}

export type { StagehandConfig, ActResult, ObserveResult };
