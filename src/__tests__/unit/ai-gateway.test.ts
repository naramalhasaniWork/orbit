import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Fakes -------------------------------------------------------------------

const { store, prismaMock, anthropicCalls, nextMessages, FakeAPIError } = vi.hoisted(() => ({
  FakeAPIError: class extends Error {
    status: number | undefined;
    headers = new Headers();
    constructor(status: number | undefined, message: string) {
      super(message);
      this.status = status;
    }
  },
  store: new Map<string, number>(),
  prismaMock: {
    workspace: { findUnique: vi.fn() },
    tokenUsage: { aggregate: vi.fn(), create: vi.fn() },
    modelRegistry: { findFirst: vi.fn() },
    providerConfig: { findUnique: vi.fn() },
  },
  anthropicCalls: [] as Array<Record<string, unknown>>,
  nextMessages: [] as Array<Record<string, unknown> | Error>,
}));

// Redis: just enough for the spend counter, including the reserve script's semantics.
vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    exists: async (k: string) => (store.has(k) ? 1 : 0),
    set: async (k: string, v: string, ..._rest: unknown[]) => {
      if (!store.has(k)) store.set(k, Number(v));
      return "OK";
    },
    get: async (k: string) => (store.has(k) ? String(store.get(k)) : null),
    incrby: async (k: string, d: number) => {
      store.set(k, (store.get(k) ?? 0) + d);
      return store.get(k);
    },
    eval: async (_script: string, _n: number, key: string, amount: number, limit: number) => {
      const total = (store.get(key) ?? 0) + amount;
      if (limit >= 0 && total > limit) return -1;
      store.set(key, total);
      return total;
    },
  }),
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/vault", () => ({ decrypt: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => {
  class FakeAnthropic {
    static APIError = FakeAPIError;
    messages = {
      stream: (params: Record<string, unknown>) => {
        anthropicCalls.push(params);
        const next = nextMessages.shift();
        return {
          finalMessage: async () => {
            if (next instanceof Error) throw next;
            return next;
          },
          async *[Symbol.asyncIterator]() {},
        };
      },
    };
  }
  return { default: FakeAnthropic };
});

import { complete, withRetry } from "@/server/ai/gateway";
import { BudgetExceededError, ProviderError } from "@/server/ai/errors";
import { TokenBudget, runWithBudget } from "@/server/ai/run-budget";
import { spendKey } from "@/server/ai/spend";
import { resetBuckets } from "@/server/ai/token-bucket";

const WS = "11111111-1111-4111-8111-111111111111";
const ctx = { workspaceId: WS, agentPhase: "executor" as const };
const request = { model: "claude-sonnet-5-5", system: "rules", messages: [{ role: "user" as const, content: "hi" }], maxTokens: 500 };

function message(usage: Record<string, number>) {
  return {
    content: [{ type: "text", text: "ok" }],
    model: "claude-sonnet-5-5",
    stop_reason: "end_turn",
    usage: { cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...usage },
  };
}

beforeEach(() => {
  store.clear();
  anthropicCalls.length = 0;
  nextMessages.length = 0;
  resetBuckets();
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
  prismaMock.workspace.findUnique.mockReset().mockResolvedValue({ tokenBudgetMonthly: null });
  prismaMock.tokenUsage.aggregate.mockReset().mockResolvedValue({ _sum: { cost: 0 } });
  prismaMock.tokenUsage.create.mockReset().mockResolvedValue({});
  prismaMock.modelRegistry.findFirst.mockReset().mockResolvedValue(null);
  prismaMock.providerConfig.findUnique.mockReset().mockResolvedValue(null);
});

describe("AI gateway usage accounting", () => {
  it("records cache read and cache write tokens from the provider", async () => {
    nextMessages.push(
      message({ input_tokens: 100, cache_read_input_tokens: 3000, cache_creation_input_tokens: 400, output_tokens: 50 })
    );

    const result = await complete(request, ctx);

    expect(result.usage).toEqual({ inputTokens: 3500, outputTokens: 50, cacheReadTokens: 3000, cacheCreationTokens: 400 });
    await vi.waitFor(() => expect(prismaMock.tokenUsage.create).toHaveBeenCalled());
    const row = prismaMock.tokenUsage.create.mock.calls[0][0].data;
    expect(row).toMatchObject({ workspaceId: WS, cachedTokens: 3000, cacheCreationTokens: 400, inputTokens: 3500 });
    // $2/M uncached, $0.20/M cache read, 1.25x input for cache writes, $10/M output
    const expected = (100 * 2 + 3000 * 0.2 + 400 * 2 * 1.25 + 50 * 10) / 1_000_000;
    expect(row.cost).toBeCloseTo(expected, 6);
  });

  it("settles the spend reservation to the actual cost", async () => {
    nextMessages.push(message({ input_tokens: 1000, output_tokens: 100 }));
    await complete(request, ctx);
    // 1000 * $2/M + 100 * $10/M = $0.003 = 3000 micro-dollars
    expect(store.get(spendKey(WS))).toBe(3000);
  });

  it("records into the active run budget", async () => {
    nextMessages.push(message({ input_tokens: 10, cache_read_input_tokens: 90, output_tokens: 5 }));
    const budget = new TokenBudget();
    await runWithBudget(budget, () => complete(request, ctx));
    expect(budget.getAgentUsage("executor")).toMatchObject({ inputTokens: 100, outputTokens: 5, cachedTokens: 90, callCount: 1 });
  });
});

describe("AI gateway budgets", () => {
  it("throws BudgetExceededError before calling the provider when the month's budget is spent", async () => {
    prismaMock.workspace.findUnique.mockResolvedValue({ tokenBudgetMonthly: 5 });
    prismaMock.tokenUsage.aggregate.mockResolvedValue({ _sum: { cost: 4.9999 } });

    // A workspace this process hasn't cached a limit for yet
    const capped = { ...ctx, workspaceId: "22222222-2222-4222-8222-222222222222" };
    const err = await complete(request, capped).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(BudgetExceededError);
    expect((err as Error).message).toContain("AI budget exceeded");
    expect((err as Error).message).toContain("$5.00 monthly AI budget");
    expect(anthropicCalls).toHaveLength(0);
    expect(store.get(spendKey(capped.workspaceId))).toBe(4_999_900); // rejected reservation left no trace
  });

  it("throws BudgetExceededError once the run's token budget is used up", async () => {
    const budget = new TokenBudget({ maxInputTokens: 50 });
    budget.record(60, 0);
    const err = await runWithBudget(budget, () => complete(request, ctx)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BudgetExceededError);
    expect((err as BudgetExceededError).scope).toBe("run");
    expect(anthropicCalls).toHaveLength(0);
  });

  it("releases the reservation when the provider call fails", async () => {
    nextMessages.push(new FakeAPIError(400, "bad request"));
    await expect(complete(request, ctx)).rejects.toBeInstanceOf(ProviderError);
    expect(store.get(spendKey(WS))).toBe(0);
  });
});

describe("withRetry", () => {
  const wait = vi.fn(async () => undefined);

  it("retries retryable provider errors with backoff, honouring retry-after", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new ProviderError("anthropic", "overloaded", { status: 529, retryAfterMs: 5000 }))
      .mockResolvedValueOnce("ok");
    await expect(withRetry("t", fn, wait)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(5000);
  });

  it("does not retry client errors or budget errors", async () => {
    const bad = vi.fn().mockRejectedValue(new ProviderError("anthropic", "bad", { status: 400 }));
    await expect(withRetry("t", bad, wait)).rejects.toThrow("bad");
    expect(bad).toHaveBeenCalledTimes(1);

    const budget = vi.fn().mockRejectedValue(new BudgetExceededError("workspace", "no money"));
    await expect(withRetry("t", budget, wait)).rejects.toThrow("no money");
    expect(budget).toHaveBeenCalledTimes(1);
  });

  it("gives up after three attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new ProviderError("openai", "rate limited", { status: 429 }));
    await expect(withRetry("t", fn, wait)).rejects.toThrow("rate limited");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
