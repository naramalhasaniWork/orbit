import { z } from "zod";

export const STEP_STATUSES = {
  passed: "passed",
  failed: "failed",
  skipped: "skipped",
  healed: "healed",
} as const;

export const VERDICTS = {
  pass: "pass",
  fail: "fail",
  flaky: "flaky",
  skipped: "skipped",
  healed: "healed",
} as const;

export const StepResultSchema = z.object({
  stepIndex: z.number().int().min(0),
  action: z.string().describe("The action that was performed"),
  expected: z.string().describe("What was expected to happen"),
  actual: z.string().describe("What actually happened"),
  status: z.enum(["passed", "failed", "skipped", "healed"]),
  screenshotUrl: z
    .string()
    .optional()
    .describe("URL to the screenshot taken at this step"),
  healedSelector: z
    .string()
    .optional()
    .describe("If status is healed, the new selector that was used"),
  durationMs: z.number().int().min(0).describe("Time taken for this step in ms"),
});

export const ExecutionResultSchema = z.object({
  testId: z.string().describe("The test case ID that was executed"),
  verdict: z.enum(["pass", "fail", "flaky", "skipped", "healed"]),
  durationMs: z.number().int().min(0).describe("Total execution time in ms"),
  steps: z.array(StepResultSchema),
  artifacts: z.object({
    screenshots: z.array(z.string()).default([]),
    videoUrl: z.string().optional(),
    networkLog: z.string().optional(),
    domSnapshot: z.string().optional(),
    consoleLog: z.string().optional(),
  }),
});

export const ExecutorActionSchema = z.object({
  action: z.enum([
    "click",
    "fill",
    "select",
    "navigate",
    "wait",
    "assert",
    "screenshot",
    "scroll",
    "hover",
    "press_key",
    "verdict",
  ]),
  selector: z.string().optional(),
  value: z.string().optional(),
  url: z.string().optional(),
  waitMs: z.number().min(0).max(10000).optional(),
  assertion: z
    .object({
      type: z.enum([
        "visible",
        "text_contains",
        "url_matches",
        "element_exists",
        "attribute_equals",
        "element_count",
        "accessibility_check",
      ]),
      expected: z.string(),
      attribute: z.string().optional(),
      selector: z.string().optional(),
    })
    .optional(),
  verdict: z.enum(["pass", "fail"]).optional(),
  reason: z.string().describe("Explanation for the action or verdict rationale").optional(),
}).refine(
  (data) => {
    // Selector required for interactive actions
    if (["click", "fill", "select", "hover"].includes(data.action)) {
      return !!data.selector;
    }
    return true;
  },
  { message: "selector is required for click, fill, select, and hover actions" }
).refine(
  (data) => {
    // Value required for fill/select
    if (["fill", "select"].includes(data.action)) {
      return data.value !== undefined;
    }
    return true;
  },
  { message: "value is required for fill and select actions" }
).refine(
  (data) => {
    // Verdict required when action is verdict
    if (data.action === "verdict") {
      return !!data.verdict;
    }
    return true;
  },
  { message: "verdict field is required when action is verdict" }
).refine(
  (data) => {
    // URL required for navigate
    if (data.action === "navigate") {
      return !!data.url;
    }
    return true;
  },
  { message: "url is required for navigate action" }
);

export type StepResult = z.infer<typeof StepResultSchema>;
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;
export type ExecutorAction = z.infer<typeof ExecutorActionSchema>;
