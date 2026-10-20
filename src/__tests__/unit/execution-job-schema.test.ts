import { describe, it, expect } from "vitest";
import { ExecutionJobDataSchema } from "@/lib/queue/queues";

const job = {
  runId: "11111111-1111-4111-8111-111111111111",
  environmentUrl: "https://staging.example.com",
  environmentId: "22222222-2222-4222-8222-222222222222",
};

describe("ExecutionJobDataSchema", () => {
  it("accepts full-run jobs", () => {
    expect(ExecutionJobDataSchema.parse({ ...job, testCaseId: "__full_run__" }).testCaseId).toBe("__full_run__");
  });

  it("rejects per-case jobs, which no longer have a handler", () => {
    expect(() => ExecutionJobDataSchema.parse({ ...job, testCaseId: "33333333-3333-4333-8333-333333333333" })).toThrow();
  });
});
