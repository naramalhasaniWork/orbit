import type { Locator, Page } from "playwright";
import { healSelectorWithoutLlm } from "@/services/execution/self-healer";
import type { Locators } from "./types";

/**
 * Find a recorded element again without a model: css → role+name → testId
 * → text, then self-healer's heuristic strategies on the css. A strategy
 * counts only when it matches exactly one element. Polls until the timeout
 * because the page may still be rendering after the previous step.
 */

type AriaRole = Parameters<Page["getByRole"]>[0];

const POLL_MS = 200;

export interface Located {
  locator: Locator;
  strategy: "css" | "role" | "testId" | "text" | "healed";
}

function candidates(page: Page, locators: Locators): Array<[Located["strategy"], Locator]> {
  const list: Array<[Located["strategy"], Locator]> = [];
  if (locators.css) list.push(["css", page.locator(locators.css)]);
  if (locators.role) {
    list.push(["role", page.getByRole(locators.role.role as AriaRole, { name: locators.role.name, exact: true })]);
  }
  if (locators.testId) list.push(["testId", page.getByTestId(locators.testId)]);
  if (locators.text) list.push(["text", page.getByText(locators.text, { exact: true })]);
  return list;
}

async function firstUnique(list: Array<[Located["strategy"], Locator]>): Promise<Located | null> {
  for (const [strategy, locator] of list) {
    try {
      if ((await locator.count()) === 1) return { locator, strategy };
    } catch {
      // Invalid for this engine (e.g. a css the page no longer parses): try the next one
    }
  }
  return null;
}

export async function locateElement(
  page: Page, locators: Locators, projectId: string, timeoutMs: number
): Promise<Located | null> {
  const list = candidates(page, locators);
  const deadline = Date.now() + timeoutMs;
  do {
    const found = await firstUnique(list);
    if (found) return found;
    if (Date.now() >= deadline) break;
    await page.waitForTimeout(POLL_MS);
  } while (Date.now() < deadline);

  if (!locators.css) return null;
  try {
    const healed = await healSelectorWithoutLlm(page, projectId, locators.css);
    return healed ? { locator: page.locator(healed.healedSelector).first(), strategy: "healed" } : null;
  } catch {
    return null;
  }
}

/** Retry a check until it passes or the timeout runs out; rethrows the last failure. */
export async function pollUntil<T>(page: Page, timeoutMs: number, check: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await check();
    } catch (err) {
      if (Date.now() >= deadline) throw err;
      await page.waitForTimeout(POLL_MS);
    }
  }
}

const SETTLE_ACTIONS = new Set(["click", "press_key", "navigate"]);

/**
 * After an action that may navigate, wait for the network to go quiet so
 * the URL and page text reflect the action's outcome. Used identically when
 * recording and replaying, so both read the same post-step state.
 */
export async function settleAfter(page: Page, action: string): Promise<void> {
  if (!SETTLE_ACTIONS.has(action)) return;
  await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => {});
}
