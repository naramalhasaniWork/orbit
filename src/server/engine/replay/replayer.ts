import type { Page } from "playwright";
import type { StepResult } from "@/agents/schemas/execution-result";
import { performAction } from "@/services/execution/action-performer";
import { maybeSkipAuthSteps } from "@/services/execution/auth-detector";
import { resolveFillValue, substituteCredentials } from "@/lib/utils/credentials";
import { locateElement, pollUntil, settleAfter } from "./locate";
import { urlMatchesPattern } from "./url-pattern";
import type { ResolvedAction } from "./types";

/**
 * Replays a compiled script on a live page with zero model calls. Each step
 * runs its action, then must land on the recorded URL pattern and pass its
 * deterministic assertion. The first step that can't (element gone, wrong
 * page, assertion fails) is the divergence point: replay stops there and
 * reports what it completed, so the agent can take over from that step.
 */

export interface ReplayInput {
  page: Page;
  actions: ResolvedAction[];
  steps: Array<{ action: string; expected: string }>;
  testCaseName: string;
  projectId: string;
  environmentUrl: string;
  credentials: Record<string, string>;
  locatorTimeoutMs: number;
}

interface ReplayProgress {
  steps: StepResult[];
  /** Agent-style history of the completed steps, to seed the agent at a divergence */
  previousActions: Array<{ action: string; result: string }>;
  completed: ResolvedAction[];
}

export type ReplayOutcome =
  | ({ status: "passed" } & ReplayProgress)
  | ({ status: "diverged"; stepIndex: number; reason: string } & ReplayProgress);

export async function replayActions(input: ReplayInput): Promise<ReplayOutcome> {
  const progress: ReplayProgress = { steps: [], previousActions: [], completed: [] };

  const authSkips = input.actions.filter((a) => a.action === "skip_auth").length;
  if (authSkips > 0) {
    const { skipCount } = await maybeSkipAuthSteps(input.page, input.steps, input.testCaseName);
    if (skipCount < authSkips) {
      return { status: "diverged", stepIndex: 0, reason: "Session is not logged in", ...progress };
    }
  }

  for (const action of input.actions) {
    const started = Date.now();
    const step = input.steps[action.stepIndex];
    try {
      const actual = await replayStep(input, action);
      progress.steps.push({
        stepIndex: action.stepIndex, action: describeAction(action), expected: step?.expected ?? "",
        actual, status: "passed", durationMs: Date.now() - started,
      });
      progress.previousActions.push({ action: describeAction(action), result: actual });
      progress.completed.push(action);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { status: "diverged", stepIndex: action.stepIndex, reason, ...progress };
    }
  }
  return { status: "passed", ...progress };
}

async function replayStep(input: ReplayInput, action: ResolvedAction): Promise<string> {
  const { page, environmentUrl, locatorTimeoutMs } = input;
  if (action.action === "skip_auth") return "Skipped — page already authenticated";

  await expectUrl(page, action.pre.urlPattern, environmentUrl, locatorTimeoutMs, "before");
  const actual = await perform(input, action);
  await settleAfter(page, action.action);
  await expectUrl(page, action.post.urlPattern, environmentUrl, locatorTimeoutMs, "after");

  const assertion = action.post.assertion;
  if (!assertion) throw new Error(`Step ${action.stepIndex + 1} has no assertion`);
  const verified = await pollUntil(page, locatorTimeoutMs, () =>
    performAction(page, { action: "assert", assertion }, environmentUrl, input.credentials, locatorTimeoutMs)
  );
  return action.action === "assert" ? verified : `${actual}; ${verified}`;
}

async function perform(input: ReplayInput, action: ResolvedAction): Promise<string> {
  const { page, credentials, locatorTimeoutMs } = input;
  switch (action.action) {
    case "assert":
      return "";
    case "navigate":
      return performAction(
        page, { action: "navigate", url: substituteCredentials(action.url ?? "", credentials) },
        input.environmentUrl, credentials
      );
    case "scroll":
      await page.evaluate(() => window.scrollBy(0, 300));
      return "Scrolled down";
    case "press_key":
      await page.keyboard.press(action.valueRef ?? "Enter");
      return `Pressed key ${action.valueRef ?? "Enter"}`;
  }

  const located = await locateElement(page, action.locators ?? {}, input.projectId, locatorTimeoutMs);
  if (!located) throw new Error(`Element for step ${action.stepIndex + 1} not found`);
  const { locator, strategy } = located;
  switch (action.action) {
    case "click":
      await locator.click({ timeout: locatorTimeoutMs });
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      break;
    case "fill":
      await locator.fill(resolveFillValue(action.valueRef ?? "", credentials), { timeout: locatorTimeoutMs });
      break;
    case "select":
      await locator.selectOption(substituteCredentials(action.valueRef ?? "", credentials), { timeout: locatorTimeoutMs });
      break;
    case "hover":
      await locator.hover({ timeout: locatorTimeoutMs });
      break;
  }
  return `Replayed ${action.action} (found by ${strategy})`;
}

async function expectUrl(
  page: Page, pattern: string, environmentUrl: string, timeoutMs: number, when: "before" | "after"
): Promise<void> {
  await pollUntil(page, timeoutMs, async () => {
    if (!urlMatchesPattern(page.url(), pattern, environmentUrl)) {
      throw new Error(`Expected to be on ${pattern} ${when} this step, but was on ${page.url()}`);
    }
  });
}

/** Same shape as the agent's step labels ("click on #submit"). */
export function describeAction(action: ResolvedAction): string {
  const target = action.locators?.css ?? action.locators?.testId ?? action.locators?.role?.name
    ?? action.locators?.text ?? action.url;
  return target ? `${action.action} on ${target}` : action.action;
}
