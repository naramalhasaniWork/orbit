import type { Page, Locator } from "playwright";
import type { ExecutorAction } from "@/agents/schemas/execution-result";
import { resolveFillValue } from "@/lib/utils/credentials";

const ACTION_TIMEOUT = 10_000;

// ============================================================
// Locator Resolution
// ============================================================

/** Heuristic: does this reference look like a CSS/XPath selector? */
function looksLikeSelector(ref: string): boolean {
  return (
    /^[#.[/]|^\/\//.test(ref) ||
    /^[a-z]+(\[|#|\.|:|\s*>)/.test(ref) ||
    /^(text|css|xpath|role)=/.test(ref) ||
    /^[a-z]+$/.test(ref)
  );
}

/**
 * Resolve an element reference that may be a CSS selector OR a
 * human-readable label ("Sign In"). The executor LLM emits both, and
 * treating labels as CSS made every text-based assertion fail.
 * Tries the selector engine first when it looks like one, then falls
 * back through text and label matching. Returns the first locator that
 * matches something; falls back to the raw selector so downstream
 * timeouts produce a meaningful error.
 */
export async function resolveLocator(page: Page, ref: string): Promise<Locator> {
  const candidates: Locator[] = [];

  if (looksLikeSelector(ref)) {
    candidates.push(page.locator(ref));
  }
  candidates.push(
    page.getByText(ref, { exact: false }),
    page.getByRole("button", { name: ref }),
    page.getByRole("link", { name: ref }),
    page.getByLabel(ref),
    page.getByPlaceholder(ref)
  );
  if (!looksLikeSelector(ref)) {
    candidates.push(page.locator(ref));
  }

  for (const candidate of candidates) {
    try {
      if ((await candidate.count()) > 0) return candidate.first();
    } catch {
      // Invalid selector syntax for this engine — try the next candidate
    }
  }
  return page.locator(ref).first();
}

// ============================================================
// Action Performer
// ============================================================

export async function performAction(
  page: Page, action: ExecutorAction, baseUrl?: string, credentials: Record<string, string> = {}, timeout = ACTION_TIMEOUT
): Promise<string> {
  switch (action.action) {
    case "navigate": {
      if (!action.url) throw new Error("Navigate action requires a url");
      const lower = action.url.toLowerCase().trim();
      // about:blank is harmless — the LLM uses it to verify a clean
      // session; blocking it failed unauth tests at step 0
      if (lower === "about:blank") {
        await page.goto("about:blank");
        return "Navigated to about:blank (blank session state)";
      }
      if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("about:")) {
        throw new Error(`Blocked unsafe navigation to ${action.url.slice(0, 50)} — use UI elements instead`);
      }
      // Resolve relative paths — the LLM often emits "/dashboard",
      // which page.goto rejects (especially from about:blank)
      let target = action.url;
      try {
        new URL(target);
      } catch {
        const base =
          baseUrl ?? (page.url().startsWith("http") ? page.url() : undefined);
        if (!base) {
          throw new Error(
            `Cannot navigate to relative URL "${target}" — no base URL available`
          );
        }
        target = new URL(target, base).toString();
      }
      const response = await page.goto(target, {
        waitUntil: "domcontentloaded",
        timeout,
      });
      const status = response?.status() ?? "unknown";
      return `Navigated to ${target} (status: ${status})`;
    }
    case "click": {
      if (!action.selector) throw new Error("Click action requires a selector");
      const locator = await resolveLocator(page, action.selector);
      await locator.click({ timeout });
      // Wait briefly for any navigation or DOM updates triggered by the click
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      return `Clicked ${action.selector}`;
    }
    case "fill": {
      if (!action.selector) throw new Error("Fill action requires a selector");
      const locator = await resolveLocator(page, action.selector);
      await locator.fill(resolveFillValue(action.value ?? "", credentials), { timeout });
      return `Filled ${action.selector} with value`;
    }
    case "select": {
      if (!action.selector) throw new Error("Select action requires a selector");
      const locator = await resolveLocator(page, action.selector);
      await locator.selectOption(
        action.value ?? "",
        { timeout }
      );
      return `Selected ${action.value} in ${action.selector}`;
    }
    case "hover": {
      if (!action.selector) throw new Error("Hover action requires a selector");
      const locator = await resolveLocator(page, action.selector);
      await locator.hover({ timeout });
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
      return await performAssertion(page, action, timeout);
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
  page: Page, action: ExecutorAction, timeout: number
): Promise<string> {
  if (!action.assertion) throw new Error("Assert action requires assertion object");

  const { type, expected } = action.assertion;
  // Element assertions may carry the element ref in assertion.selector or
  // the action's selector, with `expected` describing the outcome in prose
  const elementRef = action.assertion.selector ?? action.selector ?? expected;

  switch (type) {
    case "visible": {
      const locator = await resolveLocator(page, elementRef);
      let isVisible = false;
      try {
        await locator.waitFor({ state: "visible", timeout });
        isVisible = true;
      } catch {
        isVisible = false;
      }
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
      const locator = await resolveLocator(page, elementRef);
      const count = await locator.count();
      if (count === 0) throw new Error(`Element "${expected}" does not exist`);
      return `Verified "${expected}" exists`;
    }
    case "attribute_equals": {
      if (!action.assertion.selector) throw new Error("attribute_equals requires assertion.selector");
      if (!action.assertion.attribute) throw new Error("attribute_equals requires assertion.attribute");

      const attrValue = await page.locator(action.assertion.selector).first().getAttribute(
        action.assertion.attribute,
        { timeout }
      );

      if (attrValue !== expected) {
        throw new Error(
          `Attribute "${action.assertion.attribute}" on "${action.assertion.selector}" is "${attrValue}", expected "${expected}"`
        );
      }
      return `Verified ${action.assertion.selector} has ${action.assertion.attribute}="${expected}"`;
    }
    case "element_count": {
      if (!action.assertion.selector) throw new Error("element_count requires assertion.selector");

      const elCount = await page.locator(action.assertion.selector).count();
      const expectedCount = parseInt(expected, 10);

      if (isNaN(expectedCount)) {
        throw new Error(`element_count expected value must be a number, got "${expected}"`);
      }
      if (elCount !== expectedCount) {
        throw new Error(
          `Found ${elCount} elements matching "${action.assertion.selector}", expected ${expectedCount}`
        );
      }
      return `Verified ${elCount} elements match "${action.assertion.selector}"`;
    }
    case "accessibility_check": {
      if (!action.assertion.selector) throw new Error("accessibility_check requires assertion.selector");

      const a11yResults = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return { found: false, issues: ["Element not found"] };

        const issues: string[] = [];
        const htmlEl = el as HTMLElement;
        const tag = htmlEl.tagName.toLowerCase();

        // Check for accessible name
        const hasLabel = !!(
          htmlEl.getAttribute("aria-label") ||
          htmlEl.getAttribute("aria-labelledby") ||
          htmlEl.getAttribute("title") ||
          (tag === "input" && htmlEl.getAttribute("id") &&
            document.querySelector(`label[for="${htmlEl.getAttribute("id")}"]`))
        );
        if (!hasLabel && ["input", "select", "textarea", "button"].includes(tag)) {
          if (!(tag === "button" && htmlEl.textContent?.trim())) {
            issues.push("Missing accessible label (aria-label, aria-labelledby, or associated <label>)");
          }
        }

        // Check for role attribute on custom interactive elements
        const hasClick = htmlEl.getAttribute("onclick") || htmlEl.getAttribute("tabindex");
        if (hasClick && !htmlEl.getAttribute("role") && !["button", "a", "input", "select", "textarea"].includes(tag)) {
          issues.push("Interactive element missing ARIA role");
        }

        // Check images for alt text
        if (tag === "img" && !htmlEl.getAttribute("alt") && htmlEl.getAttribute("alt") !== "") {
          issues.push("Image missing alt attribute");
        }

        // Check focusability
        const tabIndex = htmlEl.getAttribute("tabindex");
        const isNativelyFocusable = ["a", "button", "input", "select", "textarea"].includes(tag);
        if (!isNativelyFocusable && hasClick && tabIndex === null) {
          issues.push("Interactive element not keyboard-focusable (missing tabindex)");
        }

        return { found: true, issues };
      }, action.assertion.selector);

      if (!a11yResults.found) {
        throw new Error(`Element "${action.assertion.selector}" not found for accessibility check`);
      }

      if (a11yResults.issues.length > 0) {
        throw new Error(
          `Accessibility issues on "${action.assertion.selector}": ${a11yResults.issues.join("; ")}`
        );
      }

      return `Accessibility check passed for "${action.assertion.selector}"`;
    }
    default:
      throw new Error(`Unknown assertion type: ${type}`);
  }
}
