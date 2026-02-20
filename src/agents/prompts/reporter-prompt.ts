import { getOperatorPrompt } from "@/agents/prompts/operator-layer";

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
  trigger: "push" | "pr" | "scheduled" | "manual" | "linear" | "api";
  mode: "full" | "smoke" | "regression" | "targeted";
  durationMs: number;
  creditsConsumed: number;
  testResults: TestResultInput[];
  historicalData: HistoricalData;
  outputFormat: "run_summary" | "bug_report";
}

const RUN_SUMMARY_SCHEMA = `{
  "runId": "string",
  "projectId": "string",
  "trigger": "push | pr | scheduled | manual | linear | api",
  "mode": "full | smoke | regression | targeted",
  "durationMs": "number",
  "totalTests": "number",
  "passed": "number",
  "failed": "number",
  "flaky": "number",
  "skipped": "number",
  "creditsConsumed": "number",
  "summary": "string (2-3 sentence high-level summary)",
  "failures": [
    {
      "testId": "string",
      "testName": "string",
      "explanation": "string (human-readable failure explanation)",
      "suggestedFix": "string (actionable suggestion)",
      "screenshotUrl": "string (optional)",
      "severity": "critical | high | medium | low | info"
    }
  ]
}`;

const BUG_REPORT_SCHEMA = `{
  "title": "string (concise bug title)",
  "description": "string (detailed description)",
  "stepsToReproduce": ["string"],
  "expectedBehavior": "string",
  "actualBehavior": "string",
  "severity": "critical | high | medium | low | info",
  "screenshotUrls": ["string"],
  "affectedRoute": "string (optional)",
  "suggestedFix": "string (optional)"
}`;

export function buildReporterPrompt(
  context: ReporterContext,
  userContext?: string
): string {
  const {
    runId,
    projectId,
    trigger,
    mode,
    durationMs,
    creditsConsumed,
    testResults,
    historicalData,
    outputFormat,
  } = context;

  const operatorPrompt = getOperatorPrompt();

  const passed = testResults.filter((r) => r.verdict === "pass").length;
  const failed = testResults.filter((r) => r.verdict === "fail").length;
  const flaky = testResults.filter((r) => r.verdict === "flaky").length;
  const skipped = testResults.filter((r) => r.verdict === "skipped").length;

  const failedTests = testResults.filter((r) => r.verdict === "fail");

  const failedStr =
    failedTests.length > 0
      ? failedTests
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
          .join("\n\n")
      : "  (none)";

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

  const schema =
    outputFormat === "bug_report" ? BUG_REPORT_SCHEMA : RUN_SUMMARY_SCHEMA;

  const formatInstruction =
    outputFormat === "bug_report"
      ? "Generate a bug report for the FIRST failed test case."
      : "Generate a run summary covering all test results.";

  return `${operatorPrompt}

## Agent Role: Reporter
You are the Reporter agent. You analyze test execution results and produce clear, actionable reports.

## Your Task
${formatInstruction}

## Run Metadata
- **Run ID:** ${runId}
- **Project ID:** ${projectId}
- **Trigger:** ${trigger}
- **Mode:** ${mode}
- **Duration:** ${durationMs}ms
- **Credits consumed:** ${creditsConsumed}

## Results Overview
- Total: ${testResults.length}
- Passed: ${passed}
- Failed: ${failed}
- Flaky: ${flaky}
- Skipped: ${skipped}

## Failed Test Details
${failedStr}

## Historical Context
${historyStr}

## Output Schema
Your response MUST be valid JSON matching this exact schema:
${schema}

## Reporting Guidelines
1. **Failure explanations must be human-readable.** Avoid jargon. A junior developer should understand the explanation.
2. **Suggested fixes must be actionable.** Not "fix the bug" but "The login form's email validation rejects valid emails containing '+'. Update the regex in src/utils/validators.ts to allow '+' characters."
3. **Severity assessment:**
   - **critical**: Auth bypass, data loss, security vulnerability, payment processing failure.
   - **high**: Core user journey broken (login, signup, main feature).
   - **medium**: Secondary feature broken, degraded UX.
   - **low**: Minor visual issue, non-blocking behavior.
   - **info**: Informational finding, potential improvement.
4. **Compare with historical data.** Note if a failure is new vs. recurring. Flag regressions.
5. **For flaky tests,** note the flakiness and suggest investigation rather than immediate fixes.${userContext ? `

## User-Provided Context
${userContext}` : ""}`;
}
