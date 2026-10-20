import type { Page } from "playwright";
import type { ExecutorAction } from "@/agents/schemas/execution-result";
import { redactCredentials } from "@/lib/utils/credentials";
import { captureLocators } from "./locators";
import { settleAfter } from "./locate";
import { toStoredUrl, toUrlPattern } from "./url-pattern";
import {
  REPLAYABLE_ACTIONS, type Locators, type RecordedRun, type ReplayActionKind,
  type ResolvedAction, type StepSnapshot,
} from "./types";

/**
 * Records what the agent loop does so a passing run can be compiled into a
 * replay script. The step executor calls `capture` before each action (the
 * element still exists then) and `record` after it succeeds.
 *
 * Secrets never enter a recording: values are stored as typed by the agent
 * (which only ever sees {{credential:KEY}} placeholders) and then scrubbed of
 * any credential value as a second line of defence.
 */

export interface PendingCapture {
  preUrl: string;
  locators: Locators;
}

export interface ActionRecorder {
  capture(page: Page, action: ExecutorAction): Promise<PendingCapture>;
  record(page: Page, action: ExecutorAction, stepIndex: number, pending: PendingCapture, healedSelector?: string): Promise<void>;
  /** Steps the agent skipped because the session was already logged in */
  skipAuthSteps(page: Page, count: number): void;
  /** Seed with actions already replayed (divergence hand-off) */
  seed(actions: ResolvedAction[]): void;
  markUncompilable(reason: string): void;
  result(): RecordedRun;
}

const SNAPSHOT_TEXT_LIMIT = 1_500;

export function createActionRecorder(environmentUrl: string, credentials: Record<string, string>): ActionRecorder {
  const actions: ResolvedAction[] = [];
  const snapshots: StepSnapshot[] = [];
  let uncompilable: string | undefined;

  const pattern = (url: string) => toUrlPattern(url, environmentUrl);
  const scrub = (value: string) => redactCredentials(value, credentials);

  return {
    async capture(page, action) {
      const ref = action.selector;
      const elementAction = action.action !== "assert" && action.action !== "navigate";
      return {
        preUrl: page.url(),
        locators: ref && elementAction ? await captureLocators(page, ref) : {},
      };
    },

    async record(page, action, stepIndex, pending, healedSelector) {
      if (!REPLAYABLE_ACTIONS.has(action.action)) return;
      await settleAfter(page, action.action);
      const locators = Object.keys(pending.locators).length > 0 || !healedSelector
        ? pending.locators
        : { css: healedSelector };
      const resolved: ResolvedAction = {
        stepIndex,
        action: action.action as ReplayActionKind,
        pre: { urlPattern: pattern(pending.preUrl) },
        post: { urlPattern: pattern(page.url()) },
      };
      if (action.value !== undefined) resolved.valueRef = scrub(action.value);
      if (action.url) resolved.url = scrub(toStoredUrl(action.url, environmentUrl));
      if (Object.keys(locators).length > 0) resolved.locators = locators;
      if (action.action === "assert" && action.assertion) resolved.post.assertion = action.assertion;

      upsert(actions, resolved);
      upsert(snapshots, await snapshot(page, stepIndex, scrub));
    },

    skipAuthSteps(page, count) {
      const urlPattern = pattern(page.url());
      for (let stepIndex = 0; stepIndex < count; stepIndex++) {
        upsert(actions, { stepIndex, action: "skip_auth", pre: { urlPattern }, post: { urlPattern } });
      }
    },

    seed(seeded) {
      for (const action of seeded) upsert(actions, action);
    },

    markUncompilable(reason) {
      uncompilable ??= reason;
    },

    result() {
      return {
        actions: [...actions].sort((a, b) => a.stepIndex - b.stepIndex),
        snapshots: [...snapshots].sort((a, b) => a.stepIndex - b.stepIndex),
        uncompilable,
      };
    },
  };
}

/** One entry per step: a retried step keeps its latest successful action. */
function upsert<T extends { stepIndex: number }>(list: T[], item: T): void {
  const index = list.findIndex((existing) => existing.stepIndex === item.stepIndex);
  if (index >= 0) list[index] = item;
  else list.push(item);
}

async function snapshot(page: Page, stepIndex: number, scrub: (s: string) => string): Promise<StepSnapshot> {
  try {
    const [title, visibleText] = await Promise.all([
      page.title(),
      page.evaluate((limit) => (document.body?.innerText ?? "").slice(0, limit), SNAPSHOT_TEXT_LIMIT),
    ]);
    return { stepIndex, url: page.url(), title: scrub(title), visibleText: scrub(visibleText) };
  } catch {
    return { stepIndex, url: page.url(), title: "", visibleText: "" };
  }
}
