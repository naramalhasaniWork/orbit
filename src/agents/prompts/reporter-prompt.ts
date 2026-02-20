import { buildPrompt, type UserLayerInput } from "@/agents/prompts/prompt-builder";

interface TestResultInput {
  testId: string;
  testName: string;
  verdict: "pass" | "fail" | "flaky" | "skipped" | "healed";
  durationMs: number;
  steps: Array<{
    action: string;
    expected: string;
    actual: string;
    status: string;
    screenshotUrl?: string;
  }>;
  failureExplanation?: string;
}

interface HistoricalData {
  previousRunCount: number;
  previousPassRate: number;
  recentFailures: Array<{
    testName: string;
    failedAt: string;
    explanation: string;
  }>;
  flakyTests: string[];
}

export interface ReporterContext {
  runId: string;
  projectId: string;
  trigger: "push" | "pr" | "scheduled" | "manual" | "linear" | "api" | "deploy";
  mode: "full" | "smoke" | "regression" | "targeted";
  durationMs: number;
  creditsConsumed: number;
  testResults: TestResultInput[];
  historicalData: HistoricalData;
  outputFormat: "run_summary" | "bug_report";
  workspaceName?: string;
}

function buildRootCauseAnalysis(): string {
  return `## Root Cause Analysis Chain — Follow for Every Failure
For each failed test, trace the failure backward through these layers:
1. **What step failed?** Identify the exact step index and action that produced the unexpected result.
2. **What was the expected state?** What should the page/API have looked like at this point?
3. **What was the actual state?** What did the page/API actually show? Include URL, visible text, and error messages.
4. **When did the divergence begin?** Was the previous step's outcome correct? Trace back to the first incorrect state.
5. **Why did the divergence occur?** Categorize:
   - **Element not found:** Selector broke (UI refactor?), element conditionally rendered (missing precondition?), element in different location (layout change?)
   - **Wrong content:** Data not loaded (API failure?), stale cache, race condition, wrong environment
   - **Navigation failure:** Redirect loop, auth redirect (session expired?), 404 (route removed?), CORS error
   - **API error:** 4xx (validation/auth issue), 5xx (server error), timeout (performance degradation)
   - **Environment issue:** Page failed to load, blank screen, JavaScript error, network failure
6. **Is this a regression?** Check historical data — was this test passing before? If yes, flag explicitly.
7. **Is this flaky?** Is this test in the known flaky list? If yes, note flakiness history.`;
}

function buildFewShotFailure(): string {
  return `## Example — Well-Formed Failure Explanation
BAD: "Element matching selector '#btn-submit' not found in DOM."
GOOD: "The Submit button on the checkout page was not found. The test reached the payment form (step 3 succeeded), but the Submit button with selector '#btn-submit' was not present. This likely means either: (1) the button is conditionally rendered and requires all form fields to be valid first, or (2) the button's test ID was changed in a recent commit. Check 'src/components/checkout/PaymentForm.tsx' for the submit button's current selector. Confidence: 85."`;
}

function buildResultCounts(testResults: TestResultInput[]): {
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  healed: number;
} {
  return {
    passed: testResults.filter((r) => r.verdict === "pass").length,
    failed: testResults.filter((r) => r.verdict === "fail").length,
    flaky: testResults.filter((r) => r.verdict === "flaky").length,
    skipped: testResults.filter((r) => r.verdict === "skipped").length,
    healed: testResults.filter((r) => r.verdict === "healed").length,
  };
}

function formatFailedTests(testResults: TestResultInput[]): string {
  const failedTests = testResults.filter((r) => r.verdict === "fail");
  if (failedTests.length === 0) return "  (none)";

  return failedTests
    .map((t) => {
      const failedSteps = t.steps
        .filter((s) => s.status === "failed")
        .map(
          (s) =>
            `    - Action: ${s.action}\n      Expected: ${s.expected}\n      Actual: ${s.actual}${s.screenshotUrl ? `\n      Screenshot: ${s.screenshotUrl}` : ""}`
        )
        .join("\n");
      return `  **${t.testName}** (${t.testId})\n  Duration: ${t.durationMs}ms\n  Failed steps:\n${failedSteps}${t.failureExplanation ? `\n  Raw explanation: ${t.failureExplanation}` : ""}`;
    })
    .join("\n\n");
}

function buildSchema(context: ReporterContext, counts: ReturnType<typeof buildResultCounts>): string {
  const { runId, projectId, trigger, mode, durationMs, creditsConsumed, testResults } = context;

  if (context.outputFormat === "run_summary") {
    return `{
  "runId": "${runId}",
  "projectId": "${projectId}",
  "trigger": "${trigger}",
  "mode": "${mode}",
  "durationMs": ${durationMs},
  "totalTests": ${testResults.length},
  "passed": ${counts.passed},
  "failed": ${counts.failed},
  "flaky": ${counts.flaky},
  "skipped": ${counts.skipped},
  "creditsConsumed": ${creditsConsumed},
  "summary": "2-3 sentence high-level summary of this run",
  "regressionDetected": "boolean (true if a previously passing test now fails)",
  "failures": [{
    "testId": "string",
    "testName": "string",
    "rootCause": "selector_break | api_error | auth_failure | data_missing | environment_issue | race_condition | unknown",
    "explanation": "Human-readable failure explanation following the root cause analysis chain",
    "suggestedFix": "Actionable fix suggestion with specific file paths and line numbers",
    "screenshotUrl": "string (optional)",
    "severity": "critical | high | medium | low | info",
    "confidence": 0-100,
    "isRegression": "boolean"
  }],
  "patterns": [{
    "category": "string (e.g., 'auth_timeout', 'selector_break')",
    "affectedTests": ["testId1", "testId2"],
    "description": "What pattern was detected across multiple failures"
  }]
}`;
  }

  return `{
  "title": "Concise bug title (under 80 chars)",
  "description": "Detailed description of the bug including root cause analysis",
  "rootCause": "selector_break | api_error | auth_failure | data_missing | environment_issue | race_condition | unknown",
  "stepsToReproduce": ["Step 1", "Step 2", "..."],
  "expectedBehavior": "What should happen",
  "actualBehavior": "What actually happened",
  "severity": "critical | high | medium | low | info",
  "confidence": 0-100,
  "screenshotUrls": ["url1", "url2"],
  "affectedRoute": "/path",
  "suggestedFix": "Actionable fix suggestion with file paths and line numbers",
  "isRegression": "boolean"
}`;
}

export function buildReporterPrompt(
  context: ReporterContext,
  userLayer?: UserLayerInput
): string {
  const { runId, projectId, trigger, mode, durationMs, creditsConsumed, testResults, historicalData, outputFormat } = context;
  const counts = buildResultCounts(testResults);
  const isRunSummary = outputFormat === "run_summary";

  const formatInstruction = isRunSummary
    ? "Generate a comprehensive run summary covering all test results with failure analysis."
    : "Generate a detailed bug report for the FIRST failed test case with root cause analysis.";

  const historyStr = [
    `- Previous runs: ${historicalData.previousRunCount}`,
    `- Historical pass rate: ${(historicalData.previousPassRate * 100).toFixed(1)}%`,
    historicalData.flakyTests.length > 0
      ? `- Known flaky tests: ${historicalData.flakyTests.join(", ")}`
      : null,
    historicalData.recentFailures.length > 0
      ? `- Recent failures:\n${historicalData.recentFailures.map((f) => `    - ${f.testName} (${f.failedAt}): ${f.explanation}`).join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const agentInstructions = `## Agent Role: Reporter
You analyze test execution results and produce clear, actionable reports that developers can act on immediately. You think like a staff engineer doing a post-mortem — precise root cause analysis, concrete fix suggestions, and pattern recognition across failures.

## Your Task
${formatInstruction}

${buildRootCauseAnalysis()}

${buildFewShotFailure()}

## Run Metadata
- **Run ID:** ${runId}
- **Project ID:** ${projectId}
- **Trigger:** ${trigger}
- **Mode:** ${mode}
- **Duration:** ${durationMs}ms
- **Credits consumed:** ${creditsConsumed}

## Results Overview
- Total: ${testResults.length} | Passed: ${counts.passed} | Failed: ${counts.failed} | Flaky: ${counts.flaky} | Skipped: ${counts.skipped} | Healed: ${counts.healed}

## Failed Test Details
${formatFailedTests(testResults)}

## Historical Context
${historyStr}

## Output Schema
Your response MUST be valid JSON matching this exact structure:
${buildSchema(context, counts)}

## Reporting Guidelines
1. **Failure explanations must be human-readable.** A junior developer should understand them. Include what happened, why, and what to do about it.
2. **Suggested fixes must reference specific files and code.** Bad: "Fix the bug." Good: "The email validation regex in \`src/utils/validators.ts:23\` rejects valid emails with '+' characters. Update the regex to allow '+' in the local part."
3. **Severity classification:**
   - **critical**: Auth bypass, data loss, security vulnerability, payment failure, data corruption
   - **high**: Core journey broken (login, signup, primary feature), API returning 500s
   - **medium**: Secondary feature broken, degraded UX, missing validation
   - **low**: Minor visual issue, non-blocking behavior, cosmetic regression
   - **info**: Informational finding, performance observation, improvement opportunity
4. **Regression detection:** Compare with historical data. If a previously passing test now fails, set isRegression=true and note: "This test was previously passing. The failure is new as of this run."
5. **Flaky test handling:** If a test is in the known flaky list, note it: "This test is known to be flaky. Consider quarantining or investigating the root cause."
6. **Pattern recognition:** If multiple tests fail with similar root causes, group them in the patterns array. "3 tests failed due to the same authentication timeout issue — likely a backend deployment problem."
7. **Confidence scoring:** Rate confidence 0-100 for each failure analysis. Confidence < 70 means the root cause is uncertain — say so explicitly.`;

  const { systemPrompt } = buildPrompt({
    agentRole: "reporter",
    agentInstructions,
    userLayer,
    workspaceName: context.workspaceName,
    maxOutputTokens: 2000,
  });

  return systemPrompt;
}
