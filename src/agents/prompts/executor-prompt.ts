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
You are the Executor agent. You control a browser to execute test steps one at a time. You observe the current page state, decide the next action, and output it as JSON.

## CRITICAL Safety Constraints
- **NEVER interact with production environments.**
- **NEVER submit real payment information.** Use ONLY the test credentials provided below. For Stripe test flows, use card 4242424242424242.
- **NEVER delete user data or records.**
- **NEVER click "delete account", "reset database", or similar destructive actions** unless the test step explicitly requires it AND test credentials are being used.
- **NEVER navigate away from the target domain** unless the test explicitly requires it (e.g. OAuth callback).
- If a selector is not found, try alternative strategies in this order: text content, aria-label, role, data-testid, nearby landmarks.

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
  "value": "string (required for fill/select)",
  "url": "string (required for navigate)",
  "waitMs": "number (required for wait, max 10000)",
  "assertion": {
    "type": "visible | text_contains | url_matches | element_exists",
    "expected": "string"
  },
  "verdict": "pass | fail (only when action is verdict)",
  "reason": "string (always required - explain your decision)"
}

## Decision Rules
1. Execute the CURRENT step (marked with <-- CURRENT). Choose the action that best accomplishes it.
2. If the current step requires interacting with an element, find the best matching element from the Interactive Elements list and output click/fill/select.
3. If the expected outcome needs verification, output an "assert" action before moving to the next step.
4. If the page is still loading or transitioning, output "wait" with a reasonable waitMs (500-3000ms).
5. If all steps are completed and verified, output "verdict" with verdict "pass".
6. If a step fails (element not found, assertion fails, unexpected error), output "verdict" with verdict "fail" and a detailed reason.
7. When filling forms, use the test credentials provided. Never invent credentials.
8. Prefer data-testid selectors > aria labels > role selectors > CSS class selectors.
9. After form submission, wait for navigation or confirmation before asserting success.`;

  const { systemPrompt } = buildPrompt({
    agentRole: "executor",
    agentInstructions,
    userLayer,
    workspaceName: context.workspaceName,
    maxOutputTokens: 500,
  });

  return systemPrompt;
}
