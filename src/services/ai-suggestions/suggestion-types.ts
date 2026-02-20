/**
 * Types for the AI Suggestions Engine.
 * Suggestions are actionable insights generated from project state analysis.
 */

export const SUGGESTION_CATEGORIES = {
  coverage_gap: "coverage_gap",
  flaky_pattern: "flaky_pattern",
  failure_trend: "failure_trend",
  missing_test_type: "missing_test_type",
  optimization: "optimization",
} as const;

export type SuggestionCategory = keyof typeof SUGGESTION_CATEGORIES;

export const SUGGESTION_SEVERITIES = {
  info: "info",
  warning: "warning",
  critical: "critical",
} as const;

export type SuggestionSeverity = keyof typeof SUGGESTION_SEVERITIES;

export const SUGGESTION_ACTIONS = {
  generate_tests: "generate_tests",
  quarantine: "quarantine",
  review: "review",
  reindex: "reindex",
  dismiss: "dismiss",
} as const;

export type SuggestionAction = keyof typeof SUGGESTION_ACTIONS;

export interface Suggestion {
  id: string;
  category: SuggestionCategory;
  severity: SuggestionSeverity;
  title: string;
  description: string;
  actionLabel: string;
  actionType: SuggestionAction;
  actionable: boolean;
  metadata: Record<string, unknown>;
}

export interface SuggestionContext {
  projectId: string;
  totalNodes: number;
  totalRoutes: number;
  totalEndpoints: number;
  totalTests: number;
  coveragePercentage: number;
  untestedRoutes: Array<{ id: string; name: string; filePath: string }>;
  untestedEndpoints: Array<{ id: string; name: string; filePath: string; httpMethod?: string }>;
  untestedInteractiveComponents: Array<{ id: string; name: string; filePath: string }>;
  flakyTests: Array<{ name: string; occurrences: number; passRate: number | null }>;
  consecutiveFailures: Array<{ testName: string; failCount: number }>;
  failureRateTrend: number[];
  testTypeDistribution: Record<string, number>;
  missingNegativeTests: Array<{ routeName: string; filePath: string }>;
}

export interface LLMSuggestionInput {
  context: SuggestionContext;
  existingSuggestions: Suggestion[];
}
