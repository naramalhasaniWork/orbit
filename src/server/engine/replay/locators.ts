import type { Locator, Page } from "playwright";
import { resolveLocator } from "@/services/execution/action-performer";
import type { Locators } from "./types";

/**
 * Capture every stable way to find an element again, from the live element
 * the agent is about to act on. Each candidate is kept only if it matches
 * exactly one element right now, so replay never clicks the wrong twin.
 */

type AriaRole = Parameters<Page["getByRole"]>[0];

interface ElementFacts {
  css: string;
  testId: string | null;
  text: string;
}

const ARIA_LINE = /^- ([a-z]+)(?: "((?:[^"\\]|\\.)*)")?/;
const MAX_TEXT = 80;

export async function captureLocators(page: Page, ref: string): Promise<Locators> {
  let element: Locator;
  try {
    element = await resolveLocator(page, ref);
    if ((await element.count()) === 0) return {};
  } catch {
    return {};
  }

  const [facts, role] = await Promise.all([readFacts(element), readRole(element)]);
  if (!facts) return {};

  const locators: Locators = {};
  if (await isUnique(page.locator(facts.css))) locators.css = facts.css;
  if (role && await isUnique(page.getByRole(role.role as AriaRole, { name: role.name, exact: true }))) {
    locators.role = role;
  }
  if (facts.testId && await isUnique(page.getByTestId(facts.testId))) locators.testId = facts.testId;
  if (facts.text && await isUnique(page.getByText(facts.text, { exact: true }))) locators.text = facts.text;
  return locators;
}

async function isUnique(locator: Locator): Promise<boolean> {
  try {
    return (await locator.count()) === 1;
  } catch {
    return false;
  }
}

/** Playwright's own accessible role and name, so replay's getByRole agrees with it. */
async function readRole(element: Locator): Promise<Locators["role"] | null> {
  try {
    const snapshot = await element.ariaSnapshot({ timeout: 2_000 });
    const match = snapshot.split("\n")[0]?.match(ARIA_LINE);
    if (!match?.[2]) return null;
    return { role: match[1], name: match[2].replace(/\\(.)/g, "$1") };
  } catch {
    return null;
  }
}

async function readFacts(element: Locator): Promise<ElementFacts | null> {
  try {
    return await element.evaluate((el, maxText): ElementFacts => {
      // getByTestId (replay and the exported spec) reads data-testid
      const testId = el.getAttribute("data-testid");
      const text = ((el as HTMLElement).innerText ?? "").trim().replace(/\s+/g, " ");

      const cssFor = (node: Element): string => {
        if (node.id) return `#${CSS.escape(node.id)}`;
        const tag = node.tagName.toLowerCase();
        if (testId && node === el) return `[data-testid="${CSS.escape(testId)}"]`;
        const name = node.getAttribute("name");
        if (name && node === el) return `${tag}[name="${CSS.escape(name)}"]`;
        const parent = node.parentElement;
        if (!parent || node === document.body) return tag;
        const sameTag = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        const nth = sameTag.length > 1 ? `:nth-of-type(${sameTag.indexOf(node) + 1})` : "";
        return `${cssFor(parent)} > ${tag}${nth}`;
      };

      return { css: cssFor(el), testId, text: text.length <= maxText ? text : "" };
    }, MAX_TEXT);
  } catch {
    return null;
  }
}
