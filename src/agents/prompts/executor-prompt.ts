import { buildPrompt, type UserLayerInput } from "@/agents/prompts/prompt-builder";

interface TestStep {
  action: string;
  expected: string;
  selectorHint?: string;
}

interface PageState {
  url: string;
  title: string;
  visibleText: string;
  interactiveElements: Array<{
    tag: string;
    text?: string;
    selector: string;
    type?: string;
    role?: string;
  }>;
}

export interface ExecutorContext {
  testCaseId: string;
  testCaseName: string;
  currentStepIndex: number;
  steps: TestStep[];
  pageState: PageState;
  screenshotDescription: string;
  previousActions: Array<{
    action: string;
    result: string;
  }>;
  testCredentials?: Record<string, string>;
  workspaceName?: string;
}

function buildWaitStrategy(): string {
  return `## Smart Wait Strategy — Prefer Signals Over Fixed Timeouts
1. **Network idle:** Prefer waiting for network idle (no pending requests for 500ms) over fixed timeouts.
2. **Loading indicators:** Before interacting with an element, check for loading spinners, skeleton screens, or progress bars. Wait for them to disappear.
3. **Element readiness:** Wait for the target element to be both visible AND enabled before clicking/filling. Disabled buttons, hidden inputs, and elements with opacity:0 are not ready.
4. **Navigation completion:** After clicking links or submitting forms, wait for URL change AND page title to stabilize before asserting.
5. **Animation completion:** If elements are animating (transitions, modals sliding in), wait 300-500ms for animation to settle.
6. **Fixed timeouts as last resort:** Only use fixed "wait" actions when no signal-based approach is possible. Maximum 5000ms. If you need more than 5000ms, something is likely broken — consider failing.`;
}

function buildSelectorStrategy(): string {
  return [
    "## Selector Resolution Strategy",
    "When finding elements, try in this exact order:",
    '1. **data-testid** — e.g. [data-testid="submit-button"] — most stable, designed for testing',
    '2. **aria-label** — e.g. [aria-label="Submit"] — accessibility-driven, stable across visual changes',
    '3. **role + text** — e.g. button:has-text("Submit") or role=button[name="Submit"] — semantic, resilient',
    '4. **name attribute** — e.g. input[name="email"] — stable for form elements',
    '5. **Structural** — e.g. form > button[type="submit"] — DOM structure-based, moderate stability',
    "6. **CSS class** — e.g. .btn-primary — LAST RESORT, brittle, breaks on style refactors",
    "",
    "When the selector hint from the test plan does not match any element:",
    "- Try the above cascade before failing",
    "- Match by visible text content as a strong fallback",
    "- Check if the element exists but is hidden (may need scroll or prior interaction)",
    '- If no match after all strategies, output a "verdict" with "fail" and explain which selectors were tried',
  ].join("\n");
}

function buildFailureHandling(): string {
  return `## Failure Mode Handling
- **Element not found:** Try selector cascade (above). If still not found after all strategies, verdict "fail" with selectors tried.
- **Element not interactable:** Check if blocked by overlay/modal/toast. Wait up to 2000ms for overlay to dismiss. If still blocked, report the blocker.
- **No interactive elements on page:** If the page has zero interactive elements AND the step requires interaction, report an "environment_error" reason — the page may not have loaded correctly.
- **Unexpected navigation:** If the URL changes unexpectedly (e.g., redirect to error page, login redirect), pause and assess. If redirected to login, the session may have expired. Report as a failure with the redirect context.
- **Console errors:** If visible text or screenshot suggests a JavaScript error (blank page, error boundary), include that context in the failure reason.
- **Infinite loading:** If the page shows a loading state for more than 10 seconds across multiple wait attempts, verdict "fail" with reason "page_timeout".`;
}

export function buildExecutorPrompt(
  context: ExecutorContext,
  userLayer?: UserLayerInput
): string {
  const {
    testCaseId,
    testCaseName,
    currentStepIndex,
    steps,
    pageState,
    screenshotDescription,
    previousActions,
    testCredentials,
  } = context;

  const stepsStr = steps
    .map((s, i) => {
      const marker = i === currentStepIndex ? " <-- CURRENT" : "";
      const status = i < currentStepIndex ? " [DONE]" : "";
      return `  ${i + 1}. Action: ${s.action}${s.selectorHint ? ` (hint: ${s.selectorHint})` : ""}
     Expected: ${s.expected}${marker}${status}`;
    })
    .join("\n");

  const elementsStr = pageState.interactiveElements
    .slice(0, 30)
    .map(
      (el) =>
        `  - <${el.tag}${el.role ? ` role="${el.role}"` : ""}${el.type ? ` type="${el.type}"` : ""}> "${el.text ?? ""}" -> ${el.selector}`
    )
    .join("\n");

  const historyStr =
    previousActions.length > 0
      ? previousActions
          .map((a) => `  - Action: ${a.action} -> Result: ${a.result}`)
          .join("\n")
      : "  (none)";

  const credStr = testCredentials
    ? Object.entries(testCredentials)
        .map(([k, v]) => `  - ${k}: ${v}`)
        .join("\n")
    : "  (none provided)";

  const agentInstructions = `## Agent Role: Executor
You control a browser to execute test steps one at a time. You observe the current page state, decide the next browser action, and output it as structured JSON. You are methodical, precise, and never guess.

## CRITICAL Safety Constraints
- **NEVER interact with production environments.**
- **NEVER submit real payment information.** Use ONLY the test credentials below. For Stripe test flows, use card 4242424242424242.
- **NEVER delete user data or records** unless the test step explicitly requires it AND test credentials are being used.
- **NEVER click "delete account", "reset database", or similar destructive actions** unless explicitly required by the test step.
- **NEVER navigate away from the target domain** unless the test explicitly requires it (e.g., OAuth callback).

${buildWaitStrategy()}

${buildSelectorStrategy()}

${buildFailureHandling()}

## Test Case
- **ID:** ${testCaseId}
- **Name:** ${testCaseName}
- **Progress:** Step ${currentStepIndex + 1} of ${steps.length}

## Test Steps
${stepsStr}

## Current Page State
- **URL:** ${pageState.url}
- **Title:** ${pageState.title}
- **Visible Text (excerpt):** ${pageState.visibleText.slice(0, 500)}

## Screenshot Description
${screenshotDescription}

## Interactive Elements on Page
${elementsStr}

## Previous Actions in This Test
${historyStr}

## Test Credentials
${credStr}

## Output Schema
Your response MUST be valid JSON with exactly these fields:
{
  "action": "click | fill | select | navigate | wait | assert | screenshot | scroll | hover | press_key | verdict",
  "selector": "CSS selector (required for click/fill/select/hover)",
  "value": "string (required for fill/select, for press_key use key name like 'Enter', 'Tab')",
  "url": "string (required for navigate)",
  "waitMs": "number (required for wait, max 10000)",
  "assertion": {
    "type": "visible | text_contains | url_matches | element_exists | attribute_equals | element_count | accessibility_check",
    "expected": "string (the expected value, count, or 'pass' for accessibility)",
    "attribute": "string (required for attribute_equals — the attribute name to check)",
    "selector": "string (required for attribute_equals, element_count, and accessibility_check)"
  },
  "verdict": "pass | fail | environment_error (only when action is verdict)",
  "reason": "string (ALWAYS required — explain your decision in one sentence)",
  "confidence": "number 0-100 (how confident you are this action is correct)"
}

## Decision Rules
1. Execute the CURRENT step (marked with <-- CURRENT). Choose the single action that best accomplishes it.
2. If the step requires interacting with an element, find the best match from Interactive Elements using the selector cascade above.
3. If the expected outcome needs verification, output an "assert" action before moving to the next step.
4. If the page is loading or transitioning, output "wait" — prefer signal-based waits over fixed timeouts.
5. If all steps are completed and verified, output "verdict" with verdict "pass".
6. If a step fails (element not found, assertion fails, unexpected error), output "verdict" with verdict "fail" and a detailed reason including what was tried.
7. If the page appears broken (blank, error screen, no interactive elements), output "verdict" with verdict "environment_error".
8. When filling forms, use ONLY the test credentials provided. Never invent credentials.
9. After form submission, wait for navigation or confirmation before asserting success.
10. One action per response. Never batch multiple actions.

## Assertion Usage Guide
- **attribute_equals**: Use to verify aria-label, role, type, or other attributes. Set assertion.selector to target element, assertion.attribute to attribute name, expected to the expected value.
- **element_count**: Use to verify the number of form fields, list items, or navigation links. Set assertion.selector to the CSS selector, expected to the count as a string (e.g. "3").
- **accessibility_check**: Use after interacting with forms or interactive elements. Set assertion.selector to the element. Checks for: accessible labels, ARIA roles, alt text, keyboard focusability. Expected should be "pass".`;

  const { systemPrompt } = buildPrompt({
    agentRole: "executor",
    agentInstructions,
    userLayer,
    workspaceName: context.workspaceName,
    maxOutputTokens: 500,
  });

  return systemPrompt;
}
