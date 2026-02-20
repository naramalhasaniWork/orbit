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
  waitMs: z.number().optional(),
  assertion: z
    .object({
      type: z.enum(["visible", "text_contains", "url_matches", "element_exists"]),
      expected: z.string(),
    })
    .optional(),
  verdict: z.enum(["pass", "fail"]).optional(),
  reason: z.string().optional(),
});

export type StepResult = z.infer<typeof StepResultSchema>;
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;
export type ExecutorAction = z.infer<typeof ExecutorActionSchema>;
