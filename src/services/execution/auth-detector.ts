import type { Page } from "playwright";

// ============================================================
// Auth State Detection & Step Skipping
// ============================================================

const LOGIN_PAGE_SIGNALS = [
  "sign in", "log in", "login", "signin", "forgot password",
  "create account", "register",
];

const AUTHENTICATED_SIGNALS = [
  "dashboard", "welcome", "settings", "profile", "logout",
  "sign out", "log out", "my account", "navigation",
];

const UNAUTH_TEST_PATTERNS = [
  "unauth", "redirect", "logout", "log out", "session expir",
  "without auth", "no auth", "sign out", "not logged in",
  "invalid credentials", "invalid login", "wrong password", "incorrect password",
  "without token", "no token", "expired session", "expired token",
];

const LOGIN_TEST_PATTERNS = [
  "login with valid", "log in with valid", "sign in with valid",
  "successful login", "successful sign", "authenticate with valid",
  "login with correct", "log in with correct",
];

export interface AuthDetectionResult {
  isAuthenticated: boolean;
  needsLogout: boolean;
  needsLogin: boolean;
}

export async function detectAuthState(
  page: Page,
  testName: string,
  log: (msg: string) => void
): Promise<AuthDetectionResult> {
  const nameLower = testName.toLowerCase();
  const isUnauthTest = UNAUTH_TEST_PATTERNS.some((p) => nameLower.includes(p));
  const isLoginTest = LOGIN_TEST_PATTERNS.some((p) => nameLower.includes(p));

  let visibleText = "";
  try {
    visibleText = await page.evaluate(() =>
      (document.body?.innerText ?? "").slice(0, 3000).toLowerCase()
    );
  } catch {
    return { isAuthenticated: false, needsLogout: false, needsLogin: false };
  }

  const url = page.url().toLowerCase();

  const loginSignals = LOGIN_PAGE_SIGNALS.filter(
    (s) => visibleText.includes(s) || url.includes(s.replace(/\s/g, ""))
  ).length;
  const authSignals = AUTHENTICATED_SIGNALS.filter(
    (s) => visibleText.includes(s)
  ).length;

  const isOnLoginPage = loginSignals >= 2 && authSignals < 2;
  const isAuthenticated = authSignals >= 2 && loginSignals < 3;

  log(`Auth detection: loginSignals=${loginSignals}, authSignals=${authSignals}, onLogin=${isOnLoginPage}, authenticated=${isAuthenticated}`);

  const needsLogout = (isUnauthTest || isLoginTest) && isAuthenticated;
  const needsLogin = !isUnauthTest && !isLoginTest && isOnLoginPage;

  return { isAuthenticated, needsLogout, needsLogin };
}

// ============================================================
// Auth Step Auto-Skip
// ============================================================

const AUTH_STEP_KEYWORDS = [
  "login", "log in", "sign in", "signin", "email", "password",
  "credentials", "authenticate", "click.*login", "click.*sign.?in",
  "enter.*email", "enter.*password", "type.*email", "type.*password",
  "fill.*email", "fill.*password", "submit.*login", "submit.*form",
];

const DASHBOARD_SIGNALS = [
  "dashboard", "welcome", "home", "overview", "profile",
  "settings", "projects", "campaigns", "admin",
];

export interface SkipResult {
  skipCount: number;
}

export async function maybeSkipAuthSteps(
  page: Page,
  steps: Array<{ action: string; expected: string; selectorHint?: string }>,
  testCaseName: string
): Promise<SkipResult> {
  const nameLower = testCaseName.toLowerCase();

  // Never skip for explicit login/auth tests
  if (/\blogin\b|\bsign.?in\b|\bauthenticat/i.test(nameLower)) {
    return { skipCount: 0 };
  }

  let visibleText = "";
  try {
    visibleText = await page.evaluate(() =>
      (document.body?.innerText ?? "").slice(0, 3000).toLowerCase()
    );
  } catch {
    return { skipCount: 0 };
  }

  const url = page.url().toLowerCase();
  const isOnLoginPage = /\/(login|signin|sign-in|auth)\b/.test(url) ||
    (visibleText.includes("sign in") && visibleText.includes("password"));

  if (isOnLoginPage) {
    return { skipCount: 0 };
  }

  const isAuthenticated = DASHBOARD_SIGNALS.some((s) => visibleText.includes(s)) ||
    /\/(dashboard|home|projects|campaigns|admin)\b/.test(url);

  if (!isAuthenticated) {
    return { skipCount: 0 };
  }

  // Count consecutive auth-related steps at the start
  let skipCount = 0;
  for (const step of steps) {
    const stepText = `${step.action} ${step.expected} ${step.selectorHint ?? ""}`.toLowerCase();
    const isAuthStep = AUTH_STEP_KEYWORDS.some((kw) => new RegExp(kw, "i").test(stepText));
    if (isAuthStep) {
      skipCount++;
    } else {
      break;
    }
  }

  return { skipCount };
}
