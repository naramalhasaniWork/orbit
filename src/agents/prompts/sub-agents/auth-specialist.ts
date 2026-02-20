/**
 * Auth Specialist Sub-Agent Prompt
 * Handles authentication flows — login, OAuth, session management.
 * Used by the executor when test steps involve authentication.
 */

import { buildPrompt } from "@/agents/prompts/prompt-builder";

export interface AuthSpecialistContext {
  /** Type of auth flow being tested */
  authType: "login" | "signup" | "oauth" | "session" | "token-refresh" | "logout" | "mfa";
  /** Current page URL */
  pageUrl: string;
  /** Current page HTML (truncated) */
  pageHtml: string;
  /** Interactive elements on the page */
  interactiveElements: Array<{
    tag: string;
    text?: string;
    selector: string;
    type?: string;
    role?: string;
    name?: string;
  }>;
  /** Test credentials available */
  testCredentials: Record<string, string>;
  /** Previous actions taken in this auth flow */
  previousActions?: Array<{
    action: string;
    result: string;
  }>;
  /** Auth strategy detected from system map */
  detectedAuthStrategy?: string;
  /** Expected outcome after auth completes */
  expectedOutcome: string;
}

export function buildAuthSpecialistPrompt(
  context: AuthSpecialistContext
): string {
  const {
    authType,
    pageUrl,
    pageHtml,
    interactiveElements,
    testCredentials,
    previousActions,
    detectedAuthStrategy,
    expectedOutcome,
  } = context;

  const elementsStr = interactiveElements
    .slice(0, 25)
    .map(
      (el) =>
        `  - <${el.tag}${el.type ? ` type="${el.type}"` : ""}${el.name ? ` name="${el.name}"` : ""}${el.role ? ` role="${el.role}"` : ""}> "${el.text ?? ""}" -> ${el.selector}`
    )
    .join("\n");

  const credStr = Object.entries(testCredentials)
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join("\n");

  const historyStr = previousActions?.length
    ? previousActions
        .map((a) => `  - ${a.action} -> ${a.result}`)
        .join("\n")
    : "  (none)";

  const agentInstructions = `## Sub-Agent Role: Auth Specialist
You are an expert at navigating authentication flows in web applications. You determine the correct sequence of actions to complete an auth flow using only test credentials.

## CRITICAL Safety
- ONLY use the test credentials provided below. Never invent or guess credentials.
- NEVER submit real payment information.
- If the page requests information not in the test credentials, report it — do not fabricate values.

## Auth Flow
- **Type:** ${authType}
- **Page URL:** ${pageUrl}
- **Detected Strategy:** ${detectedAuthStrategy ?? "unknown"}
- **Expected Outcome:** ${expectedOutcome}

## Test Credentials
${credStr}

## Previous Actions
${historyStr}

## Interactive Elements
${elementsStr}

## Page HTML (truncated)
${pageHtml.slice(0, 3000)}

## Output Schema
Your response MUST be valid JSON:
{
  "actions": [
    {
      "action": "fill | click | wait | navigate | assert",
      "selector": "CSS selector",
      "value": "value to fill (for fill actions)",
      "waitMs": 0,
      "reason": "why this action"
    }
  ],
  "expectedState": {
    "url": "expected URL after auth completes",
    "indicators": ["text or elements that confirm success"]
  },
  "warnings": ["any concerns about this auth flow"],
  "credentialMapping": {
    "field_selector": "credential_key"
  }
}

## Auth Flow Patterns
- **Login:** Find email/username field -> fill -> find password field -> fill -> find submit button -> click -> verify redirect
- **Signup:** Similar to login but may have additional fields (name, confirm password)
- **OAuth:** Identify the OAuth provider button -> click -> handle redirect (may need to fill provider credentials)
- **Session:** Check for session cookie/token -> verify not expired -> test protected route access
- **Token Refresh:** Simulate expired token -> verify refresh mechanism -> confirm new token works
- **Logout:** Find logout button/link -> click -> verify session cleared -> verify redirect to login
- **MFA:** Complete primary auth -> identify MFA input -> use test MFA code if provided

## Rules
- Map credentials to form fields by analyzing input names, labels, and placeholders.
- For OAuth flows, describe the expected redirect chain.
- If MFA is detected but no test MFA code is provided, flag it in warnings.
- After each action, describe what state the page should be in.`;

  const { systemPrompt } = buildPrompt({
    agentRole: "executor",
    agentInstructions,
    maxOutputTokens: 600,
  });

  return systemPrompt;
}
