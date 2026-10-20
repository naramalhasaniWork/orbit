import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { testResult: { create: vi.fn() } } }));

import { prisma } from "@/lib/db";
import { recordEnvironmentError } from "@/services/execution/test-result-store";

describe("recordEnvironmentError", () => {
  it("records each case as environment_error carrying the reason", async () => {
    await recordEnvironmentError("run-1", ["tc-1", "tc-2"], "Environment validation failed: down");

    const create = prisma.testResult.create as ReturnType<typeof vi.fn>;
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0].data).toMatchObject({
      testRunId: "run-1", testCaseId: "tc-1", verdict: "environment_error",
      steps: [expect.objectContaining({ actual: "Environment validation failed: down" })],
    });
  });
});
