import { z } from "zod";

export const TEST_TYPES = {
  journey: "journey",
  api_contract: "api_contract",
  auth: "auth",
  form_validation: "form_validation",
  edge_case: "edge_case",
  regression: "regression",
  visual_regression: "visual_regression",
} as const;

export const CRITICALITY_LEVELS = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
} as const;

export const TestStepSchema = z.object({
  action: z
    .string()
    .describe("What action to perform (e.g. 'click login button', 'fill email field')"),
  expected: z
    .string()
    .describe("Expected outcome after performing the action"),
  selectorHint: z
    .string()
    .nullish()
    .describe("CSS selector or accessibility hint for the target element"),
});

export const TestCaseSchema = z.object({
  id: z.string().describe("Unique identifier for the test case"),
  name: z.string().describe("Short descriptive name"),
  type: z.enum([
    "journey",
    "api_contract",
    "auth",
    "form_validation",
    "edge_case",
    "regression",
    "visual_regression",
  ]),
  journey: z
    .string()
    .describe("User journey this test belongs to (e.g. 'authentication', 'checkout')"),
  priorityScore: z
    .number()
    .min(0)
    .max(100)
    .describe("Overall priority score (0-100)"),
  criticality: z
    .number()
    .min(0)
    .max(100)
    .describe("How critical is this to the business (0-100)"),
  risk: z
    .number()
    .min(0)
    .max(100)
    .describe("Likelihood of breakage (0-100)"),
  coverageGap: z
    .number()
    .min(0)
    .max(100)
    .describe("How much coverage this test adds (0-100)"),
  steps: z.array(TestStepSchema).min(1),
  rationale: z
    .string()
    .describe("Why this test case exists and what risk it mitigates"),
  edgeCases: z
    .array(z.string())
    .default([])
    .describe("Edge cases this test should consider"),
});

const MetadataSchema = z.object({
  totalTests: z.number(),
  coverageByJourney: z.record(z.string(), z.number()),
  coverageByType: z.record(z.string(), z.number()),
  estimatedCredits: z.number(),
});

// metadata is optional — when the LLM response is truncated mid-output the
// trailing metadata block is lost. test-case-generator.ts rebuilds it from
// the recovered test cases in that case.
export const TestPlanSchema = z.object({
  projectId: z.string(),
  version: z.number().int().positive(),
  generatedAt: z.string().describe("ISO 8601 timestamp"),
  testCases: z.array(TestCaseSchema),
  metadata: MetadataSchema.optional(),
});

export type TestStep = z.infer<typeof TestStepSchema>;
export type TestCase = z.infer<typeof TestCaseSchema>;
export type TestPlan = z.infer<typeof TestPlanSchema>;
