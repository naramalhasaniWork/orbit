import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { testResult: { upsert: vi.fn() } } }));

import { prisma } from "@/lib/db";
import { recordEnvironmentError, saveTestResult } from "@/services/execution/test-result-store";

describe("recordEnvironmentError", () => {
  it("records each case as environment_error carrying the reason", async () => {
    await recordEnvironmentError("run-1", ["tc-1", "tc-2"], "Environment validation failed: down");

    const upsert = prisma.testResult.upsert as ReturnType<typeof vi.fn>;
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0][0].create).toMatchObject({
      testRunId: "run-1", testCaseId: "tc-1", verdict: "environment_error",
      steps: [expect.objectContaining({ actual: "Environment validation failed: down" })],
    });
  });
});

describe("saveTestResult", () => {
  it("upserts on (run, case) so a retried job rewrites instead of duplicating", async () => {
    const upsert = prisma.testResult.upsert as ReturnType<typeof vi.fn>;
    upsert.mockClear();

    await saveTestResult("run-1", "tc-1", "pass", 5, [], {}, []);
    await saveTestResult("run-1", "tc-1", "fail", 7, [], {}, []);

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[1][0].where).toEqual({
      testRunId_testCaseId: { testRunId: "run-1", testCaseId: "tc-1" },
    });
    expect(upsert.mock.calls[1][0].update).toMatchObject({ verdict: "fail", durationMs: 7 });
  });
});
