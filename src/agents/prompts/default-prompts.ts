/**
 * Default user-layer prompts for each agent phase.
 * These serve as the baseline when no custom prompt is configured.
 * Workspaces can override these via the prompt management API.
 */

import type { AgentPhase } from "@/generated/prisma/client";

export const DEFAULT_USER_PROMPTS: Record<AgentPhase, string> = {
  analyst: `Focus on identifying routes, components, API endpoints, data models, and authentication strategies.
Prioritize public-facing routes and critical user journeys.
Extract framework-specific patterns (middleware, guards, interceptors).
Flag any routes that handle sensitive data (payments, PII, auth tokens).`,

  planner: `Generate test cases that cover the highest-risk user journeys first.
Prioritize authentication flows, payment processing, and data mutation endpoints.
Include edge cases: empty states, boundary values, concurrent access, expired sessions.
Ensure every critical path has at least one happy-path and one failure-path test.
Balance breadth (coverage) with depth (thoroughness on critical paths).`,

  executor: `Execute test steps methodically and precisely.
Wait for page loads and network requests to complete before asserting.
Capture screenshots at key decision points and on any failure.
If a selector fails, attempt self-healing before marking the step as failed.
Report exact error messages, stack traces, and DOM state on failures.`,

  reporter: `Summarize results with actionable insights, not just pass/fail counts.
Group failures by root cause when possible.
Highlight any new failures (regressions) vs. known flaky tests.
Provide specific fix suggestions with file paths and line numbers when available.
Prioritize critical failures (auth, payments, data integrity) in the summary.`,

  auditor: `Evaluate code quality focusing on security, performance, and maintainability.
Flag hardcoded secrets, SQL injection vectors, XSS vulnerabilities, and insecure auth patterns.
Check for missing input validation at API boundaries.
Identify N+1 query patterns and unnecessary re-renders.
Assess error handling coverage and logging practices.`,
};
