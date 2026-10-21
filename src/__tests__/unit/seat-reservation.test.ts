import { describe, it, expect, vi } from "vitest";

const state = vi.hoisted(() => ({ invites: 0, lock: true, tail: Promise.resolve() as Promise<void> }));
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

vi.mock("@/lib/billing/usage-aggregator", () => ({ checkBudgetLimit: vi.fn() }));
vi.mock("@/lib/db", () => {
  // A Pro workspace with 3 seats, 2 members, and a row lock like SELECT ... FOR UPDATE
  const tx = {
    $queryRaw: vi.fn(),
    workspace: { findUnique: async () => (await tick(), { tier: "starter", creditBalance: 0, seatCount: 3 }) },
    workspaceMember: { count: async () => (await tick(), 2) },
    workspaceInvitation: { count: async () => (await tick(), state.invites) },
  };
  return {
    prisma: {
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
        let release = () => {};
        const done = new Promise<void>((resolve) => (release = resolve));
        tx.$queryRaw.mockImplementationOnce(async () => {
          if (!state.lock) return;
          const previous = state.tail;
          state.tail = previous.then(() => done);
          await previous;
        });
        try {
          return await fn(tx);
        } finally {
          release();
        }
      },
    },
  };
});

import { withSeatReserved } from "@/lib/auth/tenant";

const invite = () =>
  withSeatReserved("ws-1", async () => {
    await tick();
    state.invites++;
  });

describe("withSeatReserved", () => {
  it("lets only one of two concurrent invites take the last seat", async () => {
    state.invites = 0;
    const results = await Promise.all([invite(), invite()]);

    expect(results.map((r) => r.ok).sort()).toEqual([false, true]);
    expect(state.invites).toBe(1);
    const refused = results.find((r) => !r.ok);
    expect(refused && !refused.ok && refused.decision.reason).toMatch(/Add seats in Billing/);
  });

  it("without the lock both pass the count (the race the lock closes)", async () => {
    state.invites = 0;
    state.lock = false;
    await Promise.all([invite(), invite()]);
    state.lock = true;

    expect(state.invites).toBe(2);
  });
});
