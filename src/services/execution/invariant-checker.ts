// ============================================================
// System Invariant Checker
// ============================================================
// Runs global assertions (invariants) during test execution.
// All checkers are pure functions. Invariant violations are
// informational in v1 — they never change the pass/fail verdict.

// ============================================================
// Types
// ============================================================

export interface InvariantViolation {
  invariantType: string;
  description: string;
  severity: "warning" | "error";
  expected?: string;
  actual?: string;
}

export interface InvariantResult {
  passed: boolean;
  violations: InvariantViolation[];
  checksRun: number;
}

export interface PageState {
  consoleMessages: Array<{ type: string; text: string }>;
  responses: Array<{ url: string; status: number }>;
  images: Array<{ src: string; loaded: boolean }>;
  loadTimeMs: number;
  title: string;
  hasH1: boolean;
}

// ============================================================
// Individual Invariant Checkers
// ============================================================

const MAX_TEXT_LENGTH = 200;

function truncate(text: string): string {
  return text.length > MAX_TEXT_LENGTH
    ? text.slice(0, MAX_TEXT_LENGTH) + "..."
    : text;
}

export function checkConsoleInvariant(
  consoleMessages: Array<{ type: string; text: string }>
): InvariantResult {
  const violations: InvariantViolation[] = [];

  for (const msg of consoleMessages) {
    if (msg.type === "error") {
      violations.push({
        invariantType: "console_error",
        description: `Console error: ${truncate(msg.text)}`,
        severity: "error",
        expected: "No console errors",
        actual: truncate(msg.text),
      });
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    checksRun: 1,
  };
}

const DEFAULT_LOAD_THRESHOLD_MS = 5000;

export function checkPageLoadInvariant(
  loadTimeMs: number,
  thresholdMs: number = DEFAULT_LOAD_THRESHOLD_MS
): InvariantResult {
  const violations: InvariantViolation[] = [];

  if (loadTimeMs > thresholdMs) {
    violations.push({
      invariantType: "page_load_time",
      description: `Page load time ${loadTimeMs}ms exceeds threshold ${thresholdMs}ms`,
      severity: "warning",
      expected: `<= ${thresholdMs}ms`,
      actual: `${loadTimeMs}ms`,
    });
  }

  return {
    passed: violations.length === 0,
    violations,
    checksRun: 1,
  };
}

export function checkNetworkInvariant(
  responses: Array<{ url: string; status: number }>
): InvariantResult {
  const violations: InvariantViolation[] = [];

  for (const resp of responses) {
    if (resp.status >= 500) {
      violations.push({
        invariantType: "server_error",
        description: `Server error ${resp.status} from ${truncate(resp.url)}`,
        severity: "error",
        expected: "No 5xx responses",
        actual: `${resp.status} ${truncate(resp.url)}`,
      });
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    checksRun: 1,
  };
}

export function checkBrokenImagesInvariant(
  images: Array<{ src: string; loaded: boolean }>
): InvariantResult {
  const violations: InvariantViolation[] = [];

  for (const img of images) {
    if (!img.loaded) {
      violations.push({
        invariantType: "broken_image",
        description: `Broken image: ${truncate(img.src)}`,
        severity: "warning",
        expected: "All images loaded",
        actual: `Failed to load: ${truncate(img.src)}`,
      });
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    checksRun: 1,
  };
}

export function checkAccessibilityInvariant(
  title: string,
  hasH1: boolean
): InvariantResult {
  const violations: InvariantViolation[] = [];

  if (!title || title.trim().length === 0) {
    violations.push({
      invariantType: "missing_title",
      description: "Page is missing a document title",
      severity: "warning",
      expected: "Non-empty document title",
      actual: "Empty or missing title",
    });
  }

  if (!hasH1) {
    violations.push({
      invariantType: "missing_h1",
      description: "Page is missing an h1 heading",
      severity: "warning",
      expected: "At least one h1 element",
      actual: "No h1 found",
    });
  }

  return {
    passed: violations.length === 0,
    violations,
    checksRun: 1,
  };
}

// ============================================================
// Page State Collector
// ============================================================

interface EvaluatablePage {
  evaluate: <T>(fn: () => T) => Promise<T>;
}

interface EvidenceForInvariants {
  networkLog: Array<{ url: string; status: number | null }>;
  consoleLog: Array<{ type: string; text: string }>;
}

export async function collectPageState(
  page: EvaluatablePage,
  evidence: EvidenceForInvariants,
  startTime: number
): Promise<PageState> {
  const domInfo = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    return {
      images: Array.from(document.images).map((img) => ({
        src: img.src,
        loaded: img.complete && img.naturalWidth > 0,
      })),
      title: document.title,
      hasH1: document.querySelector("h1") !== null,
      navigationDurationMs: nav ? Math.round(nav.duration) : null,
    };
  });

  return {
    consoleMessages: evidence.consoleLog.map((e) => ({ type: e.type, text: e.text })),
    responses: evidence.networkLog
      .filter((e): e is { url: string; status: number } => e.status !== null)
      .map((e) => ({ url: e.url, status: e.status })),
    images: domInfo.images,
    // Real page navigation duration; total test time was reported here
    // before, which flagged every multi-step test as a slow page load
    loadTimeMs: domInfo.navigationDurationMs ?? Date.now() - startTime,
    title: domInfo.title,
    hasH1: domInfo.hasH1,
  };
}

// ============================================================
// Aggregate Runner
// ============================================================

export function runAllInvariants(pageState: PageState): InvariantResult {
  const results = [
    checkConsoleInvariant(pageState.consoleMessages),
    checkPageLoadInvariant(pageState.loadTimeMs),
    checkNetworkInvariant(pageState.responses),
    checkBrokenImagesInvariant(pageState.images),
    checkAccessibilityInvariant(pageState.title, pageState.hasH1),
  ];

  const allViolations: InvariantViolation[] = [];
  let totalChecks = 0;

  for (const result of results) {
    allViolations.push(...result.violations);
    totalChecks += result.checksRun;
  }

  return {
    passed: allViolations.length === 0,
    violations: allViolations,
    checksRun: totalChecks,
  };
}
