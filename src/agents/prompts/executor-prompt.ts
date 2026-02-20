import { getOperatorPrompt } from "@/agents/prompts/operator-layer";

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
}

const OUTPUT_SCHEMA = `{
  "action": "click | fill | select | navigate | wait | assert | screenshot | scroll | hover | press_key | verdict",
  "selector": "string (CSS selector for the target element, required for click/fill/select/hover)",
  "value": "string (value for fill/select actions)",
  "url": "string (URL for navigate action)",
  "waitMs": "number (milliseconds to wait for wait action)",
  "assertion": {
    "type": "visible | text_contains | url_matches | element_exists",
    "expected": "string"
  },
  "verdict": "pass | fail (only when action is verdict)",
  "reason": "string (explanation for the action chosen or verdict rationale)"
}`;

export function buildExecutorPrompt(
  context: ExecutorContext,
  userContext?: string
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

  const operatorPrompt = getOperatorPrompt();

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
        `  - <${el.tag}${el.role ? ` role="${el.role}"` : ""}${el.type ? ` type="${el.type}"` : ""}> "${el.text ?? ""}" → ${el.selector}`
    )
    .join("\n");

  const historyStr =
    previousActions.length > 0
      ? previousActions
          .map((a) => `  - Action: ${a.action} → Result: ${a.result}`)
          .join("\n")
      : "  (none)";

  const credStr = testCredentials
    ? Object.entries(testCredentials)
        .map(([k, v]) => `  - ${k}: ${v}`)
        .join("\n")
    : "  (none provided)";

  return `${operatorPrompt}

## Agent Role: Executor
You are the Executor agent. You control a browser to execute test steps. You observe the current page state and decide what action to take next.

## CRITICAL Safety Constraints
- **NEVER interact with production environments.**
- **NEVER submit real payment information.** Use ONLY the test credentials provided below.
- **NEVER delete user data or records.**
- **NEVER click "delete account", "reset database", or similar destructive actions** unless the test step explicitly requires it AND test credentials are being used.
- If a selector is not found, try to locate the element using alternative attributes (text content, role, aria-label) before reporting failure.

## Test Case
- **ID:** ${testCaseId}
- **Name:** ${testCaseName}

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
Your response MUST be valid JSON matching this exact schema:
${OUTPUT_SCHEMA}

## Decision Rules
1. If the current step requires interacting with an element, output the appropriate action (click, fill, select, etc.).
2. If the expected outcome of the current step needs verification, output an "assert" action.
3. If all steps are completed successfully, output a "verdict" action with verdict "pass".
4. If a step fails (expected outcome not met, element not found after self-healing attempt), output a "verdict" action with verdict "fail" and explain in "reason".
5. If the page needs time to load, output a "wait" action.
6. Always provide a "reason" explaining why you chose this action.
7. When filling forms, use the test credentials provided above.${userContext ? `

## User-Provided Context
${userContext}` : ""}`;
}
