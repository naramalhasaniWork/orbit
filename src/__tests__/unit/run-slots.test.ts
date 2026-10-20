import { describe, it, expect, vi, beforeEach } from "vitest";
import { DelayedError, type Job } from "bullmq";

// The Lua script itself needs a real Redis; this fake mirrors its semantics
// (purge expired, admit if held or under the limit) to test the control flow.
const zset = new Map<string, number>();
const fakeRedis = {
  eval: vi.fn(async (_s: string, _n: number, _key: string, now: string, expiry: string, member: string, limit: string) => {
    zset.forEach((exp, m) => { if (exp <= Number(now)) zset.delete(m); });
    if (zset.has(member) || zset.size < Number(limit)) {
      zset.set(member, Number(expiry));
      return 1;
    }
    return 0;
  }),
  zrem: vi.fn(async (_k: string, member: string) => zset.delete(member)),
  zadd: vi.fn(),
};
const tier = { value: "free" as "free" | "enterprise" };
const selfHosted = { value: false };

vi.mock("@/lib/redis", () => ({ getRedis: () => fakeRedis }));
vi.mock("@/lib/self-host", () => ({ isSelfHosted: () => selfHosted.value }));
vi.mock("@/lib/db", () => ({
  prisma: {
    testRun: {
      findUnique: vi.fn(async () => ({ project: { workspaceId: "w1", workspace: { tier: tier.value } } })),
    },
  },
}));

import { withRunSlot, slotsKey, SLOT_RETRY_DELAY_MS } from "@/lib/queue/run-slots";
import { TIER_LIMITS } from "@/lib/auth/tier-limits";

function fakeJob() {
  return { moveToDelayed: vi.fn(async () => undefined) } as unknown as Job & { moveToDelayed: ReturnType<typeof vi.fn> };
}

describe("withRunSlot", () => {
  beforeEach(() => {
    zset.clear();
    vi.clearAllMocks();
    tier.value = "free"; // concurrentRuns: 1
    selfHosted.value = false;
  });

  it("defines a concurrentRuns limit on every tier", () => {
    for (const t of Object.values(TIER_LIMITS)) expect(t.concurrentRuns).toBeGreaterThan(0);
  });

  it("delays and throws DelayedError when the workspace is full, then admits after release", async () => {
    let finishFirst!: () => void;
    const first = withRunSlot(fakeJob(), "t", "run-1", () => new Promise<void>((r) => { finishFirst = r; }));
    await vi.waitFor(() => expect(zset.has("run-1")).toBe(true));
    expect(fakeRedis.eval.mock.calls[0][2]).toBe(slotsKey("w1"));

    const job2 = fakeJob();
    const fn2 = vi.fn(async () => undefined);
    await expect(withRunSlot(job2, "tok", "run-2", fn2)).rejects.toBeInstanceOf(DelayedError);
    expect(fn2).not.toHaveBeenCalled();
    expect(job2.moveToDelayed).toHaveBeenCalledWith(expect.any(Number), "tok");
    const delayedTo = job2.moveToDelayed.mock.calls[0][0] as number;
    expect(delayedTo - Date.now()).toBeGreaterThan(SLOT_RETRY_DELAY_MS - 2000);

    finishFirst();
    await first;
    expect(zset.size).toBe(0);

    await withRunSlot(fakeJob(), "t", "run-2", fn2);
    expect(fn2).toHaveBeenCalledOnce();
  });

  it("releases the slot when the run throws", async () => {
    await expect(withRunSlot(fakeJob(), "t", "run-1", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(zset.size).toBe(0);
  });

  it("is a no-op for unlimited tiers and self-host", async () => {
    tier.value = "enterprise";
    await withRunSlot(fakeJob(), "t", "run-1", async () => undefined);
    selfHosted.value = true;
    tier.value = "free";
    await withRunSlot(fakeJob(), "t", "run-2", async () => undefined);
    expect(fakeRedis.eval).not.toHaveBeenCalled();
  });
});
