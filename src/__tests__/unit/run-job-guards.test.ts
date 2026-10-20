import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/orchestrator/pipeline", () => ({
  executePipelineForRun: vi.fn(),
}));
vi.mock("@/services/orchestrator/run-manager", () => ({
  failRunIfActive: vi.fn(),
}));

import { executePipelineForRun } from "@/services/orchestrator/pipeline";
import { failRunIfActive } from "@/services/orchestrator/run-manager";
import { runPipelineForJob } from "@/lib/queue/run-job-guards";

const pipeline = executePipelineForRun as ReturnType<typeof vi.fn>;
const failIfActive = failRunIfActive as ReturnType<typeof vi.fn>;

describe("runPipelineForJob", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hands the run and its diff to the orchestrator", async () => {
    pipeline.mockResolvedValue({ status: "completed" });

    await runPipelineForJob("run-1", ["a.ts"]);

    expect(pipeline).toHaveBeenCalledWith("run-1", { changedFiles: ["a.ts"] });
    expect(failIfActive).not.toHaveBeenCalled();
  });

  it("moves the run to failed with the error when the pipeline throws", async () => {
    pipeline.mockRejectedValue(new Error("Project p1 not found"));

    await expect(runPipelineForJob("run-1")).resolves.toBeUndefined();

    expect(failIfActive).toHaveBeenCalledWith(
      "run-1", "Run could not complete: Project p1 not found"
    );
  });
});
