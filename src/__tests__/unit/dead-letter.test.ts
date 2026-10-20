import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";

const { jf, markRunFailed, add } = vi.hoisted(() => ({
  jf: { upsert: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  markRunFailed: vi.fn(),
  add: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { jobFailure: jf, testRun: { updateMany: vi.fn() } },
}));
vi.mock("@/lib/queue/run-job-guards", () => ({ markRunFailed }));
vi.mock("@/lib/queue/queues", async (orig) => ({
  ...(await orig<typeof import("@/lib/queue/queues")>()),
  getIndexingQueue: () => ({ add }),
}));

import { recordJobFailure, retryJobFailure, discardJobFailure } from "@/lib/queue/dead-letter";
import { prisma } from "@/lib/db";

const RUN = "22222222-2222-4222-8222-222222222222";
function job(over: Partial<{ attemptsMade: number; attempts: number; data: unknown }> = {}) {
  return {
    id: "run-1", name: "run-1", attemptsMade: over.attemptsMade ?? 3,
    opts: { attempts: over.attempts ?? 3 },
    data: over.data ?? { projectId: "p1", runId: RUN },
  } as unknown as Job;
}

describe("recordJobFailure", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ignores failures that will still be retried", async () => {
    await recordJobFailure("indexing", job({ attemptsMade: 1 }), new Error("x"));
    expect(jf.upsert).not.toHaveBeenCalled();
    expect(markRunFailed).not.toHaveBeenCalled();
  });

  it("persists an exhausted job and force-fails its run", async () => {
    await recordJobFailure("indexing", job(), new Error("kaboom"));

    expect(markRunFailed).toHaveBeenCalledWith(RUN, expect.stringContaining("kaboom"));
    expect(jf.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { queue_jobId: { queue: "indexing", jobId: "run-1" } },
      create: expect.objectContaining({ queue: "indexing", runId: RUN, projectId: "p1", error: "kaboom", attemptsMade: 3 }),
    }));
  });

  it("treats a job without an attempts option as single-attempt", async () => {
    const j = { ...job(), opts: {}, attemptsMade: 1 } as unknown as Job;
    await recordJobFailure("planning", j, new Error("x"));
    expect(jf.upsert).toHaveBeenCalledOnce();
  });

  it("does not keep scheduler tick failures", async () => {
    await recordJobFailure("scheduler", job({ attempts: 1, attemptsMade: 1 }), new Error("x"));
    expect(jf.upsert).not.toHaveBeenCalled();
  });
});

describe("retry / discard", () => {
  beforeEach(() => vi.clearAllMocks());
  const open = { id: "abcdef12-0000-4000-8000-000000000000", queue: "indexing", jobId: "run-1", jobName: "run-1", data: { runId: RUN }, runId: RUN, status: "open" };

  it("re-enqueues under a fresh job id and re-opens the run", async () => {
    jf.findUnique.mockResolvedValue(open);
    jf.updateMany.mockResolvedValue({ count: 1 });

    const res = await retryJobFailure(open.id, "admin-1");

    expect(res).toEqual({ ok: true, jobId: "run-1:retry:abcdef12" });
    expect(add).toHaveBeenCalledWith("run-1", { runId: RUN }, { jobId: "run-1:retry:abcdef12" });
    expect(prisma.testRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: RUN, status: "failed" },
      data: expect.objectContaining({ status: "queued" }),
    }));
  });

  it("refuses a second retry of the same failure", async () => {
    jf.findUnique.mockResolvedValue(open);
    jf.updateMany.mockResolvedValue({ count: 0 }); // lost the claim
    expect(await retryJobFailure(open.id, "a")).toMatchObject({ ok: false, code: "NOT_OPEN" });
    expect(add).not.toHaveBeenCalled();

    jf.findUnique.mockResolvedValue({ ...open, status: "retried" });
    expect(await retryJobFailure(open.id, "a")).toMatchObject({ ok: false, code: "NOT_OPEN" });
  });

  it("re-opens the failure if the enqueue throws", async () => {
    jf.findUnique.mockResolvedValue(open);
    jf.updateMany.mockResolvedValue({ count: 1 });
    add.mockRejectedValueOnce(new Error("redis down"));

    await expect(retryJobFailure(open.id, "a")).rejects.toThrow("redis down");
    expect(jf.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "open" }) }));
  });

  it("discard only closes open failures", async () => {
    jf.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await discardJobFailure("x", "a")).toBe(true);
    expect(await discardJobFailure("x", "a")).toBe(false);
  });
});
