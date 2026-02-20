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

export function buildReporterPrompt(
  context: ReporterContext,
  userLayer?: UserLayerInput
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

  const passed = testResults.filter((r) => r.verdict === "pass").length;
  const failed = testResults.filter((r) => r.verdict === "fail").length;
  const flaky = testResults.filter((r) => r.verdict === "flaky").length;
  const skipped = testResults.filter((r) => r.verdict === "skipped").length;
  const healed = testResults.filter((r) => r.verdict === "healed").length;

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

  const isRunSummary = outputFormat === "run_summary";
  const formatInstruction = isRunSummary
    ? "Generate a comprehensive run summary covering all test results."
    : "Generate a detailed bug report for the FIRST failed test case.";

  const schema = isRunSummary
    ? `{
  "runId": "${runId}",
  "projectId": "${projectId}",
  "trigger": "${trigger}",
  "mode": "${mode}",
  "durationMs": ${durationMs},
  "totalTests": ${testResults.length},
  "passed": ${passed},
  "failed": ${failed},
  "flaky": ${flaky},
  "skipped": ${skipped},
  "creditsConsumed": ${creditsConsumed},
  "summary": "2-3 sentence high-level summary of this run",
  "failures": [{
    "testId": "string",
    "testName": "string",
    "explanation": "Human-readable failure explanation",
    "suggestedFix": "Actionable fix suggestion with file paths",
    "screenshotUrl": "string (optional)",
    "severity": "critical | high | medium | low | info"
  }]
}`
    : `{
  "title": "Concise bug title (under 80 chars)",
  "description": "Detailed description of the bug",
  "stepsToReproduce": ["Step 1", "Step 2", "..."],
  "expectedBehavior": "What should happen",
  "actualBehavior": "What actually happened",
  "severity": "critical | high | medium | low | info",
  "screenshotUrls": ["url1", "url2"],
  "affectedRoute": "/path (optional)",
  "suggestedFix": "Actionable fix suggestion (optional)"
}`;

  const agentInstructions = `## Agent Role: Reporter
You are the Reporter agent. You analyze test execution results and produce clear, actionable reports that developers can act on immediately.

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
- Healed: ${healed}

## Failed Test Details
${failedStr}

## Historical Context
${historyStr}

## Output Schema
Your response MUST be valid JSON matching this exact structure:
${schema}

## Reporting Guidelines
1. **Failure explanations must be human-readable.** A junior developer should understand them. Bad: "Element matching selector '#btn-submit' not found in DOM." Good: "The Submit button on the checkout page was not found. This likely means the button is conditionally rendered and the preconditions (e.g. selecting a shipping method) were not met."
2. **Suggested fixes must reference specific files and code.** Bad: "Fix the bug." Good: "The email validation regex in \`src/utils/validators.ts:23\` rejects valid emails with '+' characters. Update the regex to allow '+' in the local part."
3. **Severity classification:**
   - **critical**: Auth bypass, data loss, security vulnerability, payment failure, data corruption.
   - **high**: Core journey broken (login, signup, primary feature), API returning 500s.
   - **medium**: Secondary feature broken, degraded UX, missing validation.
   - **low**: Minor visual issue, non-blocking behavior, cosmetic regression.
   - **info**: Informational finding, performance observation, improvement opportunity.
4. **Regression detection:** Compare with historical data. If a previously passing test now fails, flag it as a regression with "This test was previously passing. The failure is new as of this run."
5. **Flaky test handling:** If a test is in the known flaky list, note it: "This test is known to be flaky (X% pass rate over last 10 runs). Consider quarantining or investigating the root cause."
6. **Pattern recognition:** If multiple tests fail with similar root causes, group them in the summary: "3 tests failed due to the same authentication timeout issue."`;

  const { systemPrompt } = buildPrompt({
    agentRole: "reporter",
    agentInstructions,
    userLayer,
    workspaceName: context.workspaceName,
    maxOutputTokens: 2000,
  });

  return systemPrompt;
}
