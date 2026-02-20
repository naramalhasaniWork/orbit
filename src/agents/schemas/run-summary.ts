import { z } from "zod";

export const SEVERITY_LEVELS = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
  info: "info",
} as const;

export const FailureSummarySchema = z.object({
  testId: z.string(),
  testName: z.string(),
  explanation: z
    .string()
    .describe("Human-readable explanation of why the test failed"),
  suggestedFix: z
    .string()
    .describe("Actionable suggestion for fixing the failure"),
  screenshotUrl: z.string().optional(),
  severity: z.enum(["critical", "high", "medium", "low", "info"]),
});

export const RunSummarySchema = z.object({
  runId: z.string(),
  projectId: z.string(),
  trigger: z.enum(["push", "pr", "scheduled", "manual", "linear", "api"]),
  mode: z.enum(["full", "smoke", "regression", "targeted"]),
  durationMs: z.number().int().min(0),
  totalTests: z.number().int().min(0),
  passed: z.number().int().min(0),
  failed: z.number().int().min(0),
  flaky: z.number().int().min(0),
  skipped: z.number().int().min(0),
  creditsConsumed: z.number().int().min(0),
  summary: z
    .string()
    .describe("High-level summary of the run results in 2-3 sentences"),
  failures: z.array(FailureSummarySchema),
});

export const BugReportSchema = z.object({
  title: z.string().describe("Concise bug title"),
  description: z.string().describe("Detailed bug description"),
  stepsToReproduce: z.array(z.string()),
  expectedBehavior: z.string(),
  actualBehavior: z.string(),
  severity: z.enum(["critical", "high", "medium", "low", "info"]),
  screenshotUrls: z.array(z.string()).default([]),
  affectedRoute: z.string().optional(),
  suggestedFix: z.string().optional(),
});

export type FailureSummary = z.infer<typeof FailureSummarySchema>;
export type RunSummary = z.infer<typeof RunSummarySchema>;
export type BugReport = z.infer<typeof BugReportSchema>;
