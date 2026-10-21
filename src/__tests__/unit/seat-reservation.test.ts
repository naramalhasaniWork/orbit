import { describe, it, expect, vi } from "vitest";
import type { WorkspaceScope } from "@/server/data/scope";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/billing/usage-aggregator", () => ({ checkBudgetLimit: vi.fn() }));
vi.mock("@/lib/self-host", () => ({ isSelfHosted: () => false }));

import { withSeatReserved, reissueInvitation } from "@/lib/auth/tenant";

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

describe("reissueInvitation", () => {
  /** One free seat (3 seats, 2 members), one lapsed invite, a scope whose tx() locks like SELECT ... FOR UPDATE. */
  function lapsedInviteScope() {
    const invite = { id: "inv1", status: "expired", expiresAt: new Date(0), token: "old" };
    let revivals = 0;
    let tail: Promise<void> = Promise.resolve();
    const live = () => (invite.status === "pending" && invite.expiresAt > new Date() ? 1 : 0);
    const scope = {
      workspaceId: "ws-1",
      tx: async <T>(fn: (ws: unknown) => Promise<T>): Promise<T> => {
        let release = () => {};
        const done = new Promise<void>((resolve) => (release = resolve));
        const ws = {
          $queryRaw: async () => {
            const previous = tail;
            tail = previous.then(() => done);
            await previous;
          },
          workspace: { findUnique: async () => (await tick(), { tier: "starter", seatCount: 3 }) },
          // A third member joins elsewhere once a seat is taken: the workspace is then full
          workspaceMember: { count: async () => (await tick(), 2 + revivals) },
          workspaceInvitation: {
            count: async () => (await tick(), live()),
            findFirst: async () => (await tick(), { ...invite }),
            updateMany: async ({ data }: { data: { token: string; expiresAt: Date; status: string } }) => {
              await tick();
              if (invite.status === "expired" || invite.expiresAt <= new Date()) revivals++;
              Object.assign(invite, data);
              return { count: 1 };
            },
          },
        };
        try {
          return await fn(ws);
        } finally {
          release();
        }
      },
    };
    const resend = (token: string) =>
      reissueInvitation(scope as unknown as WorkspaceScope, "inv1", { token, expiresAt: new Date(Date.now() + 86_400_000) });
    return { invite, resend, revivals: () => revivals };
  }

  it("two concurrent resends of a lapsed invite at the last seat revive it at most once", async () => {
    const { resend, revivals } = lapsedInviteScope();

    const results = await Promise.all([resend("t1"), resend("t2")]);

    expect(revivals()).toBe(1);
    // The second re-reads the invite inside the lock, sees it live, and only rotates its token
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("refuses to revive a lapsed invite when no seat is free", async () => {
    const { resend, invite } = lapsedInviteScope();
    await resend("t1"); // takes the last seat, then a member fills it
    invite.status = "expired";

    const again = await resend("t2");
    expect(again.ok).toBe(false);
    expect(!again.ok && again.decision.code).toBe("LIMIT_REACHED");
  });
});

