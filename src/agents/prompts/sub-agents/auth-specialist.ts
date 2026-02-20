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

function buildAuthPatterns(): string {
  return `## Auth Flow Patterns — Framework-Specific Detection
### Login
1. Find email/username field (by name="email", type="email", placeholder containing "email", or aria-label)
2. Fill with test email credential
3. Find password field (by name="password", type="password")
4. Fill with test password credential
5. Find submit button (type="submit", text containing "Sign In"/"Log In"/"Login")
6. Click submit
7. Verify: URL changes to dashboard/home, user avatar appears, or welcome message shows

### Signup
- Similar to login but look for additional fields: name, confirm password, terms checkbox
- Some apps split signup into multiple steps — check for stepper/progress indicators
- After submission, may redirect to email verification page instead of dashboard

### OAuth (Google, GitHub, GitLab, etc.)
1. Identify the OAuth provider button (text/icon: "Continue with Google", "Sign in with GitHub")
2. Click the provider button
3. Expect redirect to provider's auth page (accounts.google.com, github.com/login/oauth)
4. If test credentials include OAuth test account, fill provider's login form
5. Approve/authorize the app if consent screen appears
6. Expect redirect back to app's callback URL
7. Verify: session established, user info loaded

### Session / Token Refresh
- Check for session cookie or JWT in localStorage/sessionStorage
- Verify token expiry handling: does the app refresh silently or redirect to login?
- Test protected route access: navigate directly to /dashboard without login — should redirect

### MFA (Multi-Factor Authentication)
- After primary auth, detect MFA input (OTP field, authenticator code input)
- If test MFA code provided in credentials, enter it
- If no test MFA code available, flag in warnings — cannot complete flow

### Logout
1. Find logout trigger (button, link, or menu item with text "Sign Out"/"Log Out"/"Logout")
2. May be inside a dropdown/avatar menu — try clicking the user avatar first
3. Click logout
4. Verify: redirected to login/landing page, session cookie cleared
5. Verify: navigating to /dashboard now redirects to login (session invalid)

### Clerk / NextAuth / Auth0 Specifics
- **Clerk:** Look for the SignIn component, Clerk modal, or redirect to accounts.*.clerk.dev
- **NextAuth:** Check for /api/auth/signin endpoint, CSRF token in form
- **Auth0:** Look for redirect to *.auth0.com, Universal Login page`;
}

function buildFewShotExample(): string {
  return `## Example — Login Flow Resolution
**Input:** authType=login, page has: input[name="email"], input[name="password"], button "Sign in", link "Forgot password?"
**Credentials:** email=test@orbit.run, password=TestPass123!

**Output:**
{
  "actions": [
    { "action": "fill", "selector": "input[name='email']", "value": "test@orbit.run", "waitMs": 0, "reason": "Email input identified by name attribute" },
    { "action": "fill", "selector": "input[name='password']", "value": "TestPass123!", "waitMs": 0, "reason": "Password input identified by name attribute" },
    { "action": "click", "selector": "button:has-text('Sign in')", "value": "", "waitMs": 0, "reason": "Submit button identified by text content" },
    { "action": "wait", "selector": "", "value": "", "waitMs": 2000, "reason": "Wait for auth redirect to complete" }
  ],
  "expectedState": {
    "url": "/dashboard",
    "indicators": ["Dashboard heading visible", "User avatar in navigation", "No login form present"]
  },
  "warnings": [],
  "credentialMapping": { "input[name='email']": "email", "input[name='password']": "password" },
  "confidence": 95
}`;
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
You are an expert at navigating authentication flows in web applications. You analyze the current page, identify the auth mechanism, and produce the correct sequence of actions using only the provided test credentials.

## CRITICAL Safety
- ONLY use the test credentials provided below. Never invent or guess credentials.
- NEVER submit real payment information.
- If the page requests information not in the test credentials, report it in warnings — do not fabricate values.
- If you cannot determine the auth flow with confidence > 70, say so and explain what is unclear.

## Chain of Thought
1. **Identify the auth UI.** What type of auth form is on the page? Standard email/password? OAuth buttons? Magic link? SSO?
2. **Map credentials to fields.** Which credential maps to which input? Match by input name, type, label, or placeholder.
3. **Plan the action sequence.** Fill fields in order, then submit. Account for multi-step flows (email first, then password on next page).
4. **Anticipate the outcome.** What should happen after successful auth? Redirect? Modal close? Session cookie set?
5. **Check for blockers.** CAPTCHA? Rate limiting? Email verification required? MFA step?

## Auth Flow
- **Type:** ${authType}
- **Page URL:** ${pageUrl}
- **Detected Strategy:** ${detectedAuthStrategy ?? "unknown — analyze the page to determine"}
- **Expected Outcome:** ${expectedOutcome}

## Test Credentials
${credStr}

## Previous Actions
${historyStr}

## Interactive Elements
${elementsStr}

## Page HTML (truncated)
${pageHtml.slice(0, 3000)}

${buildAuthPatterns()}

${buildFewShotExample()}

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
  },
  "confidence": 0-100
}

## Rules
- Map credentials to form fields by analyzing input names, labels, placeholders, and types.
- For OAuth flows, describe the expected redirect chain in warnings if it leaves the domain.
- If MFA is detected but no test MFA code is provided, flag it in warnings and set confidence < 50.
- After each action, the reason should explain what state the page should be in.
- If the page shows an error after previous actions (e.g., "Invalid credentials"), analyze the error and adjust the plan.`;

  const { systemPrompt } = buildPrompt({
    agentRole: "executor",
    agentInstructions,
    maxOutputTokens: 600,
  });

  return systemPrompt;
}
