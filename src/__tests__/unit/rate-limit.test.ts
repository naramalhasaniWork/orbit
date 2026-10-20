import { describe, it, expect, vi, beforeEach } from "vitest";

const redisMock = vi.hoisted(() => {
  const exec = vi.fn();
  const chain = { incr: vi.fn(), ttl: vi.fn(), exec };
  chain.incr.mockReturnValue(chain);
  chain.ttl.mockReturnValue(chain);
  return { chain, exec, expire: vi.fn(), multi: vi.fn(() => chain) };
});

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({ multi: redisMock.multi, expire: redisMock.expire }),
}));

import { consumeRateLimit, checkRateLimit, checkIpRateLimit } from "@/lib/auth/rate-limit";

function hit(count: number, ttl: number) {
  redisMock.exec.mockResolvedValueOnce([
    [null, count],
    [null, ttl],
  ]);
}

describe("redis rate limiter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.chain.incr.mockReturnValue(redisMock.chain);
    redisMock.chain.ttl.mockReturnValue(redisMock.chain);
    redisMock.multi.mockReturnValue(redisMock.chain);
    redisMock.expire.mockResolvedValue(1);
  });

  it("allows requests up to the limit and blocks the next", async () => {
    hit(60, 30);
    expect((await consumeRateLimit("k", 60)).allowed).toBe(true);
    hit(61, 30);
    const blocked = await consumeRateLimit("k", 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(30);
  });

  it("starts the window with EXPIRE on the first hit", async () => {
    hit(1, -1);
    await consumeRateLimit("k", 10, 60);
    expect(redisMock.expire).toHaveBeenCalledWith("ratelimit:k", 60);
  });

  it("does not reset the TTL on later hits", async () => {
    hit(2, 40);
    await consumeRateLimit("k", 10);
    expect(redisMock.expire).not.toHaveBeenCalled();
  });

  it("heals a counter key that lost its TTL", async () => {
    hit(7, -1);
    await consumeRateLimit("k", 10);
    expect(redisMock.expire).toHaveBeenCalled();
  });

  it("degrades open with a warning when Redis errors", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    redisMock.exec.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const result = await consumeRateLimit("k", 10);
    expect(result.allowed).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("degrades open when Redis hangs", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    redisMock.exec.mockReturnValueOnce(new Promise(() => {}));
    const pending = consumeRateLimit("hang", 10);
    await vi.advanceTimersByTimeAsync(600);
    expect((await pending).allowed).toBe(true);
    vi.useRealTimers();
  });

  it("skips Redis entirely for unlimited tiers", async () => {
    expect(await checkRateLimit("ws-1", "enterprise")).toBeNull();
    expect(redisMock.multi).not.toHaveBeenCalled();
  });

  it("returns 429 with Retry-After when the tier limit is exceeded", async () => {
    hit(61, 12);
    const res = await checkRateLimit("ws-1", "free");
    expect(res?.status).toBe(429);
    expect(res?.headers.get("Retry-After")).toBe("12");
  });

  it("limits per IP for unauthenticated endpoints", async () => {
    hit(21, 5);
    const res = await checkIpRateLimit("auth", "1.2.3.4", 20);
    expect(res?.status).toBe(429);
    expect(redisMock.chain.incr).toHaveBeenCalledWith("ratelimit:auth:1.2.3.4");
  });
});
