import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Redis before importing the lock module
const mockSet = vi.fn();
const mockDel = vi.fn();
const mockExpire = vi.fn();

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    set: mockSet,
    del: mockDel,
    expire: mockExpire,
  }),
}));

import { acquireLock, releaseLock } from "@/lib/redis/lock";
import type { Lock } from "@/lib/redis/lock";

describe("redis distributed lock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSet.mockReset();
    mockDel.mockReset();
    mockExpire.mockResolvedValue(1);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("acquires lock on first attempt", async () => {
    mockSet.mockResolvedValue("OK");

    const lock = await acquireLock("test-key", 60, 3, 1000);

    expect(lock.acquired).toBe(true);
    expect(lock.key).toBe("orbit:lock:test-key");
    expect(mockSet).toHaveBeenCalledWith("orbit:lock:test-key", "locked", "EX", 60, "NX");

    await releaseLock(lock);
  });

  it("retries and acquires on second attempt", async () => {
    mockSet.mockResolvedValueOnce(null).mockResolvedValueOnce("OK");

    const lockPromise = acquireLock("retry-key", 60, 3, 100);

    // Advance past first retry delay (100ms * 2^0 = 100ms)
    await vi.advanceTimersByTimeAsync(150);

    const lock = await lockPromise;

    expect(lock.acquired).toBe(true);
    expect(mockSet).toHaveBeenCalledTimes(2);

    await releaseLock(lock);
  });

  it("returns not acquired after all retries exhausted", async () => {
    mockSet.mockResolvedValue(null);

    const lockPromise = acquireLock("busy-key", 60, 2, 100);

    // Advance past all retry delays (100ms + 200ms)
    await vi.advanceTimersByTimeAsync(500);

    const lock = await lockPromise;

    expect(lock.acquired).toBe(false);
    expect(lock.key).toBe("orbit:lock:busy-key");
    // Initial attempt + 2 retries = 3 calls
    expect(mockSet).toHaveBeenCalledTimes(3);
  });

  it("refreshes TTL at half-TTL intervals", async () => {
    mockSet.mockResolvedValue("OK");

    const lock = await acquireLock("refresh-key", 10, 0, 1000);

    expect(lock.acquired).toBe(true);
    expect(mockExpire).not.toHaveBeenCalled();

    // Advance past one refresh interval (10s / 2 = 5s)
    vi.advanceTimersByTime(5000);
    expect(mockExpire).toHaveBeenCalledWith("orbit:lock:refresh-key", 10);

    // Advance another half-TTL
    vi.advanceTimersByTime(5000);
    expect(mockExpire).toHaveBeenCalledTimes(2);

    await releaseLock(lock);
  });

  it("releaseLock clears interval and deletes key", async () => {
    mockSet.mockResolvedValue("OK");
    mockDel.mockResolvedValue(1);

    const lock = await acquireLock("release-key", 10, 0, 1000);

    await releaseLock(lock);

    expect(mockDel).toHaveBeenCalledWith("orbit:lock:release-key");

    // Advancing timers should not trigger refresh after release
    mockExpire.mockClear();
    vi.advanceTimersByTime(10000);
    expect(mockExpire).not.toHaveBeenCalled();
  });

  it("releaseLock handles delete failure gracefully", async () => {
    mockSet.mockResolvedValue("OK");
    mockDel.mockRejectedValue(new Error("Redis connection lost"));

    const lock = await acquireLock("fail-release-key", 10, 0, 1000);

    // Should not throw
    await expect(releaseLock(lock)).resolves.toBeUndefined();
  });

  it("releaseLock skips delete when not acquired", async () => {
    const lock: Lock = { key: "orbit:lock:not-acquired", acquired: false };

    await releaseLock(lock);

    expect(mockDel).not.toHaveBeenCalled();
  });

  it("uses exponential backoff between retries", async () => {
    mockSet
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("OK");

    const lockPromise = acquireLock("backoff-key", 60, 2, 100);

    // First retry delay: 100 * 2^0 = 100ms
    await vi.advanceTimersByTimeAsync(100);
    expect(mockSet).toHaveBeenCalledTimes(2);

    // Second retry delay: 100 * 2^1 = 200ms
    await vi.advanceTimersByTimeAsync(200);
    expect(mockSet).toHaveBeenCalledTimes(3);

    const lock = await lockPromise;
    expect(lock.acquired).toBe(true);

    await releaseLock(lock);
  });
});
