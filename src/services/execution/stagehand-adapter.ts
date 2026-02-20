import type { Page } from "playwright";

// ============================================================
// Types
// ============================================================

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

interface ExtractResult {
  data: Record<string, unknown>;
}

interface ObserveResult {
  elements: Array<{
    selector: string;
    description: string;
  }>;
}

// ============================================================
// Stagehand adapter
// ============================================================

/**
 * Wrapper around Stagehand's act(), extract(), observe() primitives.
 *
 * Stagehand provides:
 * - Built-in prompt caching (reduces LLM calls for repeated element lookups)
 * - Element caching (remembers selectors across actions in the same session)
 * - Self-healing selectors via vision + DOM analysis
 *
 * When USE_STAGEHAND=true and BROWSERBASE_API_KEY is set, Stagehand
 * connects through Browserbase cloud browsers instead of local Playwright.
 */
export async function createStagehandSession(
  config: StagehandConfig = {}
): Promise<StagehandInstance> {
  const { Stagehand } = await import("@browserbasehq/stagehand");

  const browserbaseApiKey = config.apiKey ?? process.env.BROWSERBASE_API_KEY;
  const projectId = config.projectId ?? process.env.BROWSERBASE_PROJECT_ID;

  const stagehand = new Stagehand({
    env: browserbaseApiKey ? "BROWSERBASE" : "LOCAL",
    apiKey: browserbaseApiKey,
    projectId,
    verbose: config.verbose ? 1 : 0,
    modelName: (config.modelName ?? "gpt-4o") as "gpt-4o",
  });

  await stagehand.init();

  return {
    stagehand,
    page: stagehand.page,

    async act(action: string): Promise<ActResult> {
      const result = await stagehand.page.act(action);
      return {
        success: true,
        message: result.message ?? `Performed: ${action}`,
        action,
      };
    },

    async extract(instruction: string, schema: Record<string, unknown>): Promise<ExtractResult> {
      const result = await stagehand.page.extract({
        instruction,
        schema: schema as never,
      });
      return { data: result as Record<string, unknown> };
    },

    async observe(instruction?: string): Promise<ObserveResult> {
      const result = await stagehand.page.observe(
        instruction ? { instruction } : undefined
      );
      return {
        elements: result.map((el) => ({
          selector: el.selector,
          description: el.description,
        })),
      };
    },

    async navigate(url: string): Promise<void> {
      await stagehand.page.goto(url, { waitUntil: "domcontentloaded" });
    },

    async close(): Promise<void> {
      await stagehand.close();
    },
  };
}

export interface StagehandInstance {
  stagehand: unknown;
  page: Page;
  act: (action: string) => Promise<ActResult>;
  extract: (instruction: string, schema: Record<string, unknown>) => Promise<ExtractResult>;
  observe: (instruction?: string) => Promise<ObserveResult>;
  navigate: (url: string) => Promise<void>;
  close: () => Promise<void>;
}

export function isStagehandEnabled(): boolean {
  return process.env.USE_STAGEHAND === "true";
}

export function isBrowserbaseEnabled(): boolean {
  return !!process.env.BROWSERBASE_API_KEY;
}

export type { StagehandConfig, ActResult, ExtractResult, ObserveResult };
