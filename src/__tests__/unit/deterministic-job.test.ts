import { describe, it, expect, vi } from "vitest";
import type { Queue } from "bullmq";
import { addDeterministicJob, hashInputs } from "@/lib/queue/deterministic-job";

function fakeQueue(existing?: { state: string }) {
  const remove = vi.fn();
  const add = vi.fn();
  const queue = {
    getJob: async () => (existing ? { getState: async () => existing.state, remove } : undefined),
    add,
  } as unknown as Queue<{ x: number }>;
  return { queue, add, remove };
}

describe("addDeterministicJob", () => {
  it("adds when no job has that id", async () => {
    const { queue, add } = fakeQueue();
    expect(await addDeterministicJob(queue, "n", { x: 1 }, "index:p:sha")).toEqual({ deduped: false });
    expect(add).toHaveBeenCalledWith("n", { x: 1 }, { jobId: "index:p:sha" });
  });

  it.each(["active", "waiting", "delayed"])("dedupes against a %s job", async (state) => {
    const { queue, add } = fakeQueue({ state });
    expect(await addDeterministicJob(queue, "n", { x: 1 }, "id")).toEqual({ deduped: true });
    expect(add).not.toHaveBeenCalled();
  });

  it.each(["failed", "completed"])("replaces a retained %s job, which BullMQ would otherwise ignore", async (state) => {
    const { queue, add, remove } = fakeQueue({ state });
    expect(await addDeterministicJob(queue, "n", { x: 1 }, "id")).toEqual({ deduped: false });
    expect(remove).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledOnce();
  });
});

describe("hashInputs", () => {
  it("ignores string-array ordering and differs on content", () => {
    expect(hashInputs({ a: ["x", "y"] })).toBe(hashInputs({ a: ["y", "x"] }));
    expect(hashInputs({ a: ["x"] })).not.toBe(hashInputs({ a: ["z"] }));
  });
});
