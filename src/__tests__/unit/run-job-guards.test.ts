import { describe, it, expect, vi, beforeEach } from "vitest";

const { findRun } = vi.hoisted(() => ({ findRun: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { testRun: { findUnique: findRun } } }));
vi.mock("@/services/orchestrator/pipeline", () => ({
  executePipelineForRun: vi.fn(),
}));
vi.mock("@/services/orchestrator/run-manager", () => ({
  failRunIfActive: vi.fn(),
}));

import { executePipelineForRun } from "@/services/orchestrator/pipeline";
import { failRunIfActive } from "@/services/orchestrator/run-manager";
import { runPipelineForJob } from "@/lib/queue/run-job-guards";
import { RunLockedError } from "@/lib/queue/run-locked";

const pipeline = executePipelineForRun as ReturnType<typeof vi.fn>;
const failIfActive = failRunIfActive as ReturnType<typeof vi.fn>;

describe("runPipelineForJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findRun.mockResolvedValue({ status: "queued" });
  });

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

  it("lets a locked run escape for a delayed retry instead of failing it", async () => {
    pipeline.mockRejectedValue(new RunLockedError("run-1", 30_000));

    await expect(runPipelineForJob("run-1")).rejects.toBeInstanceOf(RunLockedError);
    expect(failIfActive).not.toHaveBeenCalled();
  });

  it("does not restart a run that finished while the retry was delayed", async () => {
    findRun.mockResolvedValue({ status: "completed" });

    await runPipelineForJob("run-1");

    expect(pipeline).not.toHaveBeenCalled();
  });
});
