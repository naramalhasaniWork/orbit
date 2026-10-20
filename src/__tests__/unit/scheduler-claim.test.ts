import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory stand-in for the row: updateMany is a compare-and-swap on nextRunAt,
// like `UPDATE ... WHERE id = $id AND next_run_at = $seen`.
const row = { id: "s1", nextRunAt: new Date("2026-10-20T10:00:00Z") as Date | null };

vi.mock("@/lib/db", () => ({
  prisma: {
    scheduledRun: {
      findMany: vi.fn(async () => [
        {
          id: "s1", projectId: "p1", cronExpression: "0 * * * *", mode: "smoke",
          nextRunAt: row.nextRunAt,
          project: { id: "p1", workspaceId: "w1", status: "active", deletedAt: null, defaultBranch: "main" },
        },
      ]),
      updateMany: vi.fn(async ({ where, data }: { where: { nextRunAt: Date }; data: { nextRunAt: Date } }) => {
        if (row.nextRunAt?.getTime() !== where.nextRunAt.getTime()) return { count: 0 };
        row.nextRunAt = data.nextRunAt;
        return { count: 1 };
      }),
      update: vi.fn(),
    },
  },
}));
vi.mock("@/services/orchestrator/run-launcher", () => ({
  launchPipelineRun: vi.fn(async () => ({ ok: true, runId: "run-1" })),
}));

import { processScheduledRuns } from "@/services/scheduler";
import { launchPipelineRun } from "@/services/orchestrator/run-launcher";

describe("processScheduledRuns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    row.nextRunAt = new Date("2026-10-20T10:00:00Z");
  });

  it("two concurrent claimers start exactly one run, with a deterministic job id", async () => {
    const [a, b] = await Promise.all([processScheduledRuns(), processScheduledRuns()]);

    expect(a + b).toBe(1);
    expect(launchPipelineRun).toHaveBeenCalledTimes(1);
    expect(launchPipelineRun).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: "scheduled",
        mode: "smoke",
        jobId: "sched:s1:2026-10-20T10:00:00.000Z",
      })
    );
    expect(row.nextRunAt!.getTime()).toBeGreaterThan(new Date("2026-10-20T10:00:00Z").getTime());
  });
});
