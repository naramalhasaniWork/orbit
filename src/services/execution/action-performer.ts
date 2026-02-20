import type { Page } from "playwright";
import type { ExecutorAction } from "@/agents/schemas/execution-result";

const ACTION_TIMEOUT = 10_000;

// ============================================================
// Action Performer
// ============================================================

export async function performAction(
  page: Page,
  action: ExecutorAction
): Promise<string> {
  switch (action.action) {
    case "navigate": {
      if (!action.url) throw new Error("Navigate action requires a url");
      const response = await page.goto(action.url, {
        waitUntil: "domcontentloaded",
        timeout: ACTION_TIMEOUT,
      });
      const status = response?.status() ?? "unknown";
      return `Navigated to ${action.url} (status: ${status})`;
    }
    case "click": {
      if (!action.selector) throw new Error("Click action requires a selector");
      await page.locator(action.selector).first().click({ timeout: ACTION_TIMEOUT });
      // Wait briefly for any navigation or DOM updates triggered by the click
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      return `Clicked ${action.selector}`;
    }
    case "fill": {
      if (!action.selector) throw new Error("Fill action requires a selector");
      const locator = page.locator(action.selector).first();
      await locator.fill(action.value ?? "", { timeout: ACTION_TIMEOUT });
      return `Filled ${action.selector} with value`;
    }
    case "select": {
      if (!action.selector) throw new Error("Select action requires a selector");
      await page.locator(action.selector).first().selectOption(
        action.value ?? "",
        { timeout: ACTION_TIMEOUT }
      );
      return `Selected ${action.value} in ${action.selector}`;
    }
    case "hover": {
      if (!action.selector) throw new Error("Hover action requires a selector");
      await page.locator(action.selector).first().hover({ timeout: ACTION_TIMEOUT });
      return `Hovered over ${action.selector}`;
    }
    case "scroll": {
      await page.evaluate(() => window.scrollBy(0, 300));
      return "Scrolled down";
    }
    case "press_key": {
      await page.keyboard.press(action.value ?? "Enter");
      return `Pressed key ${action.value ?? "Enter"}`;
    }
    case "wait": {
      if (action.selector) {
        // Wait for a specific element to appear
        await page.locator(action.selector).first().waitFor({
          state: "visible",
          timeout: Math.min(action.waitMs ?? 5000, 10_000),
        });
        return `Waited for element ${action.selector} to be visible`;
      }
      const ms = Math.min(action.waitMs ?? 1000, 10_000);
      await page.waitForTimeout(ms);
      return `Waited ${ms}ms`;
    }
    case "assert": {
      return await performAssertion(page, action);
    }
    case "screenshot": {
      return "Screenshot captured";
    }
    case "verdict": {
      return `Verdict: ${action.verdict} - ${action.reason ?? ""}`;
    }
    default:
      throw new Error(`Unknown action: ${action.action}`);
  }
}

// ============================================================
// Assertion Handler
// ============================================================

async function performAssertion(
  page: Page,
  action: ExecutorAction
): Promise<string> {
  if (!action.assertion) throw new Error("Assert action requires assertion object");

  const { type, expected } = action.assertion;

  switch (type) {
    case "visible": {
      const isVisible = await page.locator(expected).first().isVisible({ timeout: ACTION_TIMEOUT });
      if (!isVisible) throw new Error(`Element "${expected}" is not visible`);
      return `Verified "${expected}" is visible`;
    }
    case "text_contains": {
      const bodyText = await page.evaluate(() => document.body.innerText);
      if (!bodyText.includes(expected)) {
        throw new Error(`Page text does not contain "${expected}"`);
      }
      return `Verified page contains text "${expected}"`;
    }
    case "url_matches": {
      const currentUrl = page.url();
      if (!currentUrl.includes(expected)) {
        throw new Error(`URL "${currentUrl}" does not match "${expected}"`);
      }
      return `Verified URL contains "${expected}"`;
    }
    case "element_exists": {
      const count = await page.locator(expected).count();
      if (count === 0) throw new Error(`Element "${expected}" does not exist`);
      return `Verified "${expected}" exists`;
    }
    default:
      throw new Error(`Unknown assertion type: ${type}`);
  }
}
