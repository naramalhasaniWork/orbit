/**
 * AI Suggestions Engine — generates actionable insights for a project.
 * Combines rule-based analysis (fast, no LLM cost) with LLM-powered
 * reasoning (deeper insights via Sonnet) for comprehensive suggestions.
 */

import { prisma } from "@/lib/db";
import { createTrackedCompletion } from "@/lib/ai/tracked-completion";
import { getModelForTask } from "@/lib/ai/model-router";
import { buildPrompt } from "@/agents/prompts/prompt-builder";
import { parseLlmJson } from "@/lib/utils/json-parse";
import type {
  Suggestion,
  SuggestionContext,
  SuggestionCategory,
} from "./suggestion-types";

const MAX_SUGGESTIONS = 12;

// ============================================================
// Main Entry Point
// ============================================================

export async function generateSuggestions(
  projectId: string,
  includeLLM = true
): Promise<Suggestion[]> {
  const context = await buildSuggestionContext(projectId);
  const suggestions: Suggestion[] = [];

  // Rule-based suggestions (no LLM cost)
  suggestions.push(
    ...coverageGapSuggestions(context),
    ...flakyPatternSuggestions(context),
    ...failureTrendSuggestions(context),
    ...missingTestTypeSuggestions(context),
    ...optimizationSuggestions(context),
  );

  // LLM-powered suggestions for deeper insights
  if (includeLLM && suggestions.length < MAX_SUGGESTIONS) {
    const llmSuggestions = await generateLLMSuggestions(context, suggestions);
    suggestions.push(...llmSuggestions);
  }

  // Sort: critical first, then warning, then info
  const order: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  suggestions.sort((a, b) => (order[a.severity] ?? 2) - (order[b.severity] ?? 2));

  return suggestions.slice(0, MAX_SUGGESTIONS);
}

// ============================================================
// Context Builder
// ============================================================

async function buildSuggestionContext(
  projectId: string
): Promise<SuggestionContext> {
  const [nodes, testCases, flakyTests, recentRuns, recentResults] = await Promise.all([
    prisma.systemMapNode.findMany({
      where: { projectId },
      select: { id: true, name: true, type: true, filePath: true, metadata: true },
    }),
    prisma.testCase.findMany({
      where: { projectId, isEnabled: true },
      select: { name: true, type: true, journey: true },
    }),
    prisma.flakyTest.findMany({
      where: { projectId, isQuarantined: false },
      include: { testCase: { select: { name: true } } },
      orderBy: { occurrences: "desc" },
      take: 10,
    }),
    prisma.testRun.findMany({
      where: { projectId, status: "completed" },
      orderBy: { completedAt: "desc" },
      take: 5,
      select: { id: true, failed: true, totalTests: true },
    }),
    prisma.testResult.findMany({
      where: { testRun: { projectId, status: "completed" }, verdict: "fail" },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { testCase: { select: { name: true } } },
    }),
  ]);

  const testNames = new Set(testCases.map((tc) => tc.name.toLowerCase()));
  const routes = nodes.filter((n) => n.type === "route");
  const endpoints = nodes.filter((n) => n.type === "endpoint");
  const components = nodes.filter((n) => n.type === "component");

  const isNodeCovered = (name: string) =>
    Array.from(testNames).some(
      (tn) => tn.includes(name.toLowerCase()) || name.toLowerCase().includes(tn)
    );

  const untestedRoutes = routes
    .filter((n) => !isNodeCovered(n.name))
    .map((n) => ({ id: n.id, name: n.name, filePath: n.filePath }));

  const untestedEndpoints = endpoints
    .filter((n) => !isNodeCovered(n.name))
    .map((n) => ({
      id: n.id,
      name: n.name,
      filePath: n.filePath,
      httpMethod: (n.metadata as Record<string, unknown>)?.httpMethod as string | undefined,
    }));

  const untestedInteractiveComponents = components
    .filter((n) => {
      const meta = n.metadata as Record<string, unknown>;
      return meta?.isInteractive === true && !isNodeCovered(n.name);
    })
    .map((n) => ({ id: n.id, name: n.name, filePath: n.filePath }));

  // Consecutive failures per test
  const failureCounts = new Map<string, number>();
  for (const result of recentResults) {
    const name = result.testCase.name;
    failureCounts.set(name, (failureCounts.get(name) ?? 0) + 1);
  }
  const consecutiveFailures = Array.from(failureCounts.entries())
    .filter(([, count]) => count >= 2)
    .map(([testName, failCount]) => ({ testName, failCount }))
    .sort((a, b) => b.failCount - a.failCount);

  // Failure rate trend
  const failureRateTrend = recentRuns.map((r) =>
    r.totalTests > 0 ? Math.round((r.failed / r.totalTests) * 100) : 0
  );

  // Test type distribution
  const testTypeDistribution: Record<string, number> = {};
  for (const tc of testCases) {
    testTypeDistribution[tc.type] = (testTypeDistribution[tc.type] ?? 0) + 1;
  }

  // Routes/endpoints that likely have forms but no negative/edge tests
  const formRoutes = routes.filter((n) =>
    /signup|register|login|checkout|settings|profile|create|edit|new/i.test(n.name)
  );
  const hasNegativeTest = (routeName: string) =>
    testCases.some((tc) => {
      const tcLower = tc.name.toLowerCase();
      const routeLower = routeName.toLowerCase();
      return (
        (tcLower.includes(routeLower) || routeLower.includes(tcLower)) &&
        (tc.type === "edge_case" || tc.type === "form_validation")
      );
    });
  const missingNegativeTests = formRoutes
    .filter((r) => !hasNegativeTest(r.name))
    .map((r) => ({ routeName: r.name, filePath: r.filePath }));

  const coveredCount = nodes.filter((n) => isNodeCovered(n.name)).length;

  return {
    projectId,
    totalNodes: nodes.length,
    totalRoutes: routes.length,
    totalEndpoints: endpoints.length,
    totalTests: testCases.length,
    coveragePercentage: nodes.length > 0 ? Math.round((coveredCount / nodes.length) * 100) : 0,
    untestedRoutes,
    untestedEndpoints,
    untestedInteractiveComponents,
    flakyTests: flakyTests.map((f) => ({
      name: f.testCase.name,
      occurrences: f.occurrences,
      passRate: f.passRate,
    })),
    consecutiveFailures,
    failureRateTrend,
    testTypeDistribution,
    missingNegativeTests,
  };
}

// ============================================================
// Rule-Based Suggestions
// ============================================================

function coverageGapSuggestions(ctx: SuggestionContext): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // Critical untested routes (auth, payment, API)
  const criticalUntested = ctx.untestedRoutes.filter((r) =>
    /auth|login|signup|register|payment|checkout|api/i.test(r.name)
  );
  if (criticalUntested.length > 0) {
    suggestions.push(makeSuggestion(
      "coverage_gap", "critical",
      `${criticalUntested.length} critical route${criticalUntested.length > 1 ? "s have" : " has"} no tests`,
      `Routes like ${criticalUntested.slice(0, 3).map((r) => r.name).join(", ")} are untested. These appear to be authentication or payment-related.`,
      "Generate Tests", "generate_tests", true,
      { routeIds: criticalUntested.map((r) => r.id) },
    ));
  }

  // General untested routes
  const nonCritical = ctx.untestedRoutes.filter((r) =>
    !/auth|login|signup|register|payment|checkout|api/i.test(r.name)
  );
  if (nonCritical.length > 0) {
    suggestions.push(makeSuggestion(
      "coverage_gap", "info",
      `${nonCritical.length} route${nonCritical.length > 1 ? "s" : ""} without test coverage`,
      `Consider adding tests for ${nonCritical.slice(0, 3).map((r) => r.name).join(", ")}${nonCritical.length > 3 ? ` and ${nonCritical.length - 3} more` : ""}.`,
      "Generate Tests", "generate_tests", true,
      { routeIds: nonCritical.map((r) => r.id) },
    ));
  }

  // Untested endpoints
  if (ctx.untestedEndpoints.length > 0) {
    const severity = ctx.untestedEndpoints.length > 5 ? "warning" : "info";
    suggestions.push(makeSuggestion(
      "coverage_gap", severity,
      `${ctx.untestedEndpoints.length} API endpoint${ctx.untestedEndpoints.length > 1 ? "s" : ""} without contract tests`,
      `Endpoints like ${ctx.untestedEndpoints.slice(0, 3).map((e) => `${e.httpMethod ?? "?"} ${e.name}`).join(", ")} have no API contract tests.`,
      "Generate Tests", "generate_tests", true,
      { endpointIds: ctx.untestedEndpoints.map((e) => e.id) },
    ));
  }

  // Untested interactive components
  if (ctx.untestedInteractiveComponents.length > 0) {
    suggestions.push(makeSuggestion(
      "coverage_gap", "info",
      `${ctx.untestedInteractiveComponents.length} interactive component${ctx.untestedInteractiveComponents.length > 1 ? "s are" : " is"} untested`,
      `Components like ${ctx.untestedInteractiveComponents.slice(0, 3).map((c) => c.name).join(", ")} have user-interactive elements but no tests.`,
      "Generate Tests", "generate_tests", true,
      { componentIds: ctx.untestedInteractiveComponents.map((c) => c.id) },
    ));
  }

  return suggestions;
}

function flakyPatternSuggestions(ctx: SuggestionContext): Suggestion[] {
  const suggestions: Suggestion[] = [];

  const highFlaky = ctx.flakyTests.filter((f) => f.occurrences >= 4);
  if (highFlaky.length > 0) {
    suggestions.push(makeSuggestion(
      "flaky_pattern", "warning",
      `"${highFlaky[0].name}" has been flaky ${highFlaky[0].occurrences} times`,
      `Consider adding wait conditions, stabilizing selectors, or quarantining this test while investigating.${highFlaky[0].passRate != null ? ` Pass rate: ${Math.round(highFlaky[0].passRate * 100)}%.` : ""}`,
      "Review Flaky Tests", "review", true,
      { flakyTests: highFlaky.map((f) => f.name) },
    ));
  }

  const moderateFlaky = ctx.flakyTests.filter(
    (f) => f.occurrences >= 2 && f.occurrences < 4
  );
  if (moderateFlaky.length > 0) {
    suggestions.push(makeSuggestion(
      "flaky_pattern", "info",
      `${moderateFlaky.length} test${moderateFlaky.length > 1 ? "s show" : " shows"} early flakiness`,
      `Tests like "${moderateFlaky[0].name}" have shown inconsistent results. Monitor these closely.`,
      "Review", "review", false,
      { flakyTests: moderateFlaky.map((f) => f.name) },
    ));
  }

  return suggestions;
}

function failureTrendSuggestions(ctx: SuggestionContext): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // Consecutive failures
  const persistent = ctx.consecutiveFailures.filter((f) => f.failCount >= 3);
  for (const failure of persistent.slice(0, 2)) {
    suggestions.push(makeSuggestion(
      "failure_trend", "critical",
      `"${failure.testName}" has failed ${failure.failCount} consecutive runs`,
      `This likely indicates a breaking change in the tested flow. Review recent commits affecting this area.`,
      "Review Failure", "review", true,
      { testName: failure.testName, failCount: failure.failCount },
    ));
  }

  // Increasing failure rate
  const trend = ctx.failureRateTrend;
  if (trend.length >= 2 && trend[0] > trend[1] && trend[0] > 10) {
    suggestions.push(makeSuggestion(
      "failure_trend", "warning",
      "Failure rate is increasing",
      `Last run had a ${trend[0]}% failure rate, up from ${trend[1]}%. This may indicate a regression.`,
      "Review Failures", "review", true,
      { failureRateTrend: trend },
    ));
  }

  return suggestions;
}

function missingTestTypeSuggestions(ctx: SuggestionContext): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // Missing negative/edge case tests for form routes
  if (ctx.missingNegativeTests.length > 0) {
    suggestions.push(makeSuggestion(
      "missing_test_type", "warning",
      `${ctx.missingNegativeTests.length} form${ctx.missingNegativeTests.length > 1 ? "s" : ""} missing negative tests`,
      `Routes like ${ctx.missingNegativeTests.slice(0, 3).map((r) => r.routeName).join(", ")} have no edge case or form validation tests. Consider testing invalid inputs, boundary values, and XSS payloads.`,
      "Generate Tests", "generate_tests", true,
      { routes: ctx.missingNegativeTests.map((r) => r.routeName) },
    ));
  }

  // No auth tests at all
  if (ctx.totalTests > 0 && !ctx.testTypeDistribution["auth"]) {
    suggestions.push(makeSuggestion(
      "missing_test_type", "critical",
      "No authentication flow tests exist",
      "The test suite has no auth-type tests. Login, logout, token refresh, and protected route access should be tested.",
      "Generate Auth Tests", "generate_tests", true,
      { missingType: "auth" },
    ));
  }

  // No API contract tests
  if (ctx.totalEndpoints > 0 && !ctx.testTypeDistribution["api_contract"]) {
    suggestions.push(makeSuggestion(
      "missing_test_type", "warning",
      "No API contract tests exist",
      `There are ${ctx.totalEndpoints} API endpoints but no contract tests. These validate that endpoints accept valid payloads, reject invalid ones, and enforce authentication.`,
      "Generate API Tests", "generate_tests", true,
      { missingType: "api_contract", endpointCount: ctx.totalEndpoints },
    ));
  }

  return suggestions;
}

function optimizationSuggestions(ctx: SuggestionContext): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // Low overall coverage
  if (ctx.totalNodes > 0 && ctx.coveragePercentage < 30) {
    suggestions.push(makeSuggestion(
      "optimization", "warning",
      `Test coverage is only ${ctx.coveragePercentage}%`,
      `The current test suite covers ${ctx.coveragePercentage}% of detected nodes. Consider running a full plan generation to improve coverage.`,
      "Regenerate Plan", "generate_tests", true,
      { coveragePercentage: ctx.coveragePercentage },
    ));
  }

  return suggestions;
}

// ============================================================
// LLM-Powered Suggestions
// ============================================================

async function generateLLMSuggestions(
  ctx: SuggestionContext,
  existingSuggestions: Suggestion[]
): Promise<Suggestion[]> {
  const model = await getModelForTask("test_generation");

  const contextSummary = [
    `Project has ${ctx.totalRoutes} routes, ${ctx.totalEndpoints} endpoints, ${ctx.totalTests} tests.`,
    `Coverage: ${ctx.coveragePercentage}%.`,
    ctx.untestedRoutes.length > 0 ? `Untested routes: ${ctx.untestedRoutes.slice(0, 5).map((r) => r.name).join(", ")}.` : "",
    ctx.consecutiveFailures.length > 0 ? `Tests with consecutive failures: ${ctx.consecutiveFailures.slice(0, 3).map((f) => `${f.testName} (${f.failCount}x)`).join(", ")}.` : "",
    ctx.flakyTests.length > 0 ? `Flaky tests: ${ctx.flakyTests.slice(0, 3).map((f) => `${f.name} (${f.occurrences}x)`).join(", ")}.` : "",
    ctx.missingNegativeTests.length > 0 ? `Forms without negative tests: ${ctx.missingNegativeTests.slice(0, 3).map((r) => r.routeName).join(", ")}.` : "",
    `Test types: ${Object.entries(ctx.testTypeDistribution).map(([t, c]) => `${t}:${c}`).join(", ") || "none"}.`,
  ].filter(Boolean).join("\n");

  const existingSummary = existingSuggestions.length > 0
    ? `Already suggested:\n${existingSuggestions.map((s) => `- ${s.title}`).join("\n")}`
    : "No existing suggestions.";

  const { systemPrompt } = buildPrompt({
    agentRole: "planner",
    agentInstructions: `## Task: Generate Additional Testing Suggestions

Analyze the project state below and generate 2-3 additional actionable suggestions that the rule-based system might have missed. Focus on:
- Patterns in failure data that suggest deeper issues
- Missing test scenarios based on the application structure
- Optimization opportunities for the test suite

## Project State
${contextSummary}

## ${existingSummary}

## Output Schema
Return valid JSON array of suggestions:
[{
  "category": "coverage_gap | flaky_pattern | failure_trend | missing_test_type | optimization",
  "severity": "info | warning | critical",
  "title": "Short title (under 80 chars)",
  "description": "Actionable description with specific details",
  "actionLabel": "Button label",
  "actionType": "generate_tests | quarantine | review | reindex | dismiss"
}]

Do NOT repeat suggestions that already exist. Generate ONLY new, unique insights.`,
  });

  try {
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: ctx.projectId },
      select: { workspaceId: true },
    });

    const result = await createTrackedCompletion(
      {
        model,
        systemPrompt,
        messages: [{ role: "user", content: "Generate testing suggestions as JSON." }],
        maxTokens: 1500,
        temperature: 0.4,
      },
      {
        workspaceId: project.workspaceId,
        projectId: ctx.projectId,
        agentPhase: "planner",
      }
    );

    const parsed = parseLlmJson(result.content) as Array<{
      category: string;
      severity: string;
      title: string;
      description: string;
      actionLabel: string;
      actionType: string;
    }>;

    if (!Array.isArray(parsed)) return [];

    return parsed.slice(0, 3).map((s, i) => makeSuggestion(
      validateCategory(s.category),
      validateSeverity(s.severity),
      s.title,
      s.description,
      s.actionLabel || "Review",
      validateAction(s.actionType),
      true,
      { source: "llm", index: i },
    ));
  } catch {
    // LLM suggestions are best-effort — rule-based always works
    return [];
  }
}

// ============================================================
// Helpers
// ============================================================

function makeSuggestion(
  category: SuggestionCategory,
  severity: "info" | "warning" | "critical",
  title: string,
  description: string,
  actionLabel: string,
  actionType: "generate_tests" | "quarantine" | "review" | "reindex" | "dismiss",
  actionable: boolean,
  metadata: Record<string, unknown>,
): Suggestion {
  return {
    id: `sug-${Math.random().toString(36).slice(2, 10)}`,
    category,
    severity,
    title,
    description,
    actionLabel,
    actionType,
    actionable,
    metadata,
  };
}

function validateCategory(s: string): SuggestionCategory {
  const valid = ["coverage_gap", "flaky_pattern", "failure_trend", "missing_test_type", "optimization"];
  return valid.includes(s) ? s as SuggestionCategory : "optimization";
}

function validateSeverity(s: string): "info" | "warning" | "critical" {
  const valid = ["info", "warning", "critical"];
  return valid.includes(s) ? s as "info" | "warning" | "critical" : "info";
}

function validateAction(s: string): "generate_tests" | "quarantine" | "review" | "reindex" | "dismiss" {
  const valid = ["generate_tests", "quarantine", "review", "reindex", "dismiss"];
  return valid.includes(s) ? s as "generate_tests" | "quarantine" | "review" | "reindex" | "dismiss" : "review";
}
