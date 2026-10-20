import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: string[] = [];
const tx = {
  $queryRaw: vi.fn(async () => { calls.push("lock"); return []; }),
  testRun: { create: vi.fn(async () => { calls.push("create"); return { id: "run-1" }; }) },
};

vi.mock("@/lib/db", () => ({
  prisma: {
    project: { findUnique: vi.fn(async () => ({ workspaceId: "w1", defaultBranch: "main" })) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    testRun: { delete: vi.fn() },
  },
}));
vi.mock("@/lib/auth/tenant", () => ({ canConsume: vi.fn() }));
vi.mock("@/lib/queue/queues", () => ({ getIndexingQueue: () => ({ add }) }));
vi.mock("@/lib/queue/availability", () => ({ withQueueTimeout: <T>(p: Promise<T>) => p }));
vi.mock("@/lib/websocket", () => ({ emitRunStarted: vi.fn() }));

const add = vi.fn();
import { canConsume } from "@/lib/auth/tenant";
import { launchPipelineRun } from "@/services/orchestrator/run-launcher";

const input = { projectId: "p1", mode: "smoke" as const, trigger: "scheduled" as const };

describe("launchPipelineRun allowance + insert", () => {
  beforeEach(() => {
    calls.length = 0;
    vi.clearAllMocks();
    add.mockResolvedValue({});
  });

  it("locks the workspace row, checks the allowance on the same tx, then inserts", async () => {
    (canConsume as ReturnType<typeof vi.fn>).mockImplementation(async () => { calls.push("check"); return { allowed: true }; });

    const res = await launchPipelineRun({ ...input, jobId: "sched:s1:slot" });

    expect(res).toEqual({ ok: true, runId: "run-1" });
    expect(calls).toEqual(["lock", "check", "create"]);
    expect(canConsume).toHaveBeenCalledWith("w1", "run", tx);
    expect(add).toHaveBeenCalledWith(expect.any(String), expect.anything(), { jobId: "sched:s1:slot" });
  });

  it("creates nothing when the allowance is exhausted", async () => {
    (canConsume as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: false, code: "LIMIT_REACHED", reason: "Monthly run limit reached (100).",
    });

    const res = await launchPipelineRun(input);

    expect(res).toEqual({ ok: false, code: "LIMIT_REACHED", reason: "Monthly run limit reached (100)." });
    expect(tx.testRun.create).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });
});
