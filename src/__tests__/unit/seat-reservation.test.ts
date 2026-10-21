import { describe, it, expect, vi } from "vitest";
import type { WorkspaceScope } from "@/server/data/scope";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/billing/usage-aggregator", () => ({ checkBudgetLimit: vi.fn() }));
vi.mock("@/lib/self-host", () => ({ isSelfHosted: () => false }));

import { withSeatReserved } from "@/lib/auth/tenant";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/** A Pro workspace with 3 seats and 2 members, as a ctx.db scope whose tx() locks like SELECT ... FOR UPDATE. */
function fakeScope({ lock }: { lock: boolean }) {
  const state = { invites: 0 };
  let tail: Promise<void> = Promise.resolve();
  const scope = {
    workspaceId: "ws-1",
    tx: async <T>(fn: (ws: unknown) => Promise<T>): Promise<T> => {
      let release = () => {};
      const done = new Promise<void>((resolve) => (release = resolve));
      const ws = {
        $queryRaw: async () => {
          if (!lock) return;
          const previous = tail;
          tail = previous.then(() => done);
          await previous;
        },
        workspace: { findUnique: async () => (await tick(), { tier: "starter", seatCount: 3 }) },
        workspaceMember: { count: async () => (await tick(), 2) },
        workspaceInvitation: { count: async () => (await tick(), state.invites) },
      };
      try {
        return await fn(ws);
      } finally {
        release();
      }
    },
  };
  const invite = () =>
    withSeatReserved(scope as unknown as WorkspaceScope, async () => {
      await tick();
      state.invites++;
    });
  return { state, invite };
}

describe("withSeatReserved", () => {
  it("lets only one of two concurrent invites take the last seat", async () => {
    const { state, invite } = fakeScope({ lock: true });
    const results = await Promise.all([invite(), invite()]);

    expect(results.map((r) => r.ok).sort()).toEqual([false, true]);
    expect(state.invites).toBe(1);
    const refused = results.find((r) => !r.ok);
    expect(refused && !refused.ok && refused.decision.reason).toMatch(/Add seats in Billing/);
  });

  it("without the lock both pass the count (the race the lock closes)", async () => {
    const { state, invite } = fakeScope({ lock: false });
    await Promise.all([invite(), invite()]);
    expect(state.invites).toBe(2);
  });
});
