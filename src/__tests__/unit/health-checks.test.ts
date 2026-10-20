import { describe, it, expect, vi, beforeEach } from "vitest";

const { queryRaw, ping } = vi.hoisted(() => ({ queryRaw: vi.fn(), ping: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: { $queryRaw: queryRaw } }));
vi.mock("@/lib/redis", () => ({ getRedis: () => ({ ping }) }));

import { checkHealth } from "@/lib/health/checks";

describe("checkHealth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    queryRaw.mockReset().mockResolvedValue([{ "?column?": 1 }]);
    ping.mockReset().mockResolvedValue("PONG");
  });

  it("is healthy when database and redis respond", async () => {
    expect(await checkHealth()).toEqual({
      healthy: true,
      checks: { database: "ok", redis: "ok" },
    });
  });

  it("reports which dependency failed", async () => {
    queryRaw.mockRejectedValue(new Error("connection refused"));
    expect(await checkHealth()).toEqual({
      healthy: false,
      checks: { database: "fail", redis: "ok" },
    });

    queryRaw.mockResolvedValue([]);
    ping.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await checkHealth()).toEqual({
      healthy: false,
      checks: { database: "ok", redis: "fail" },
    });
  });

  it("fails a check that hangs instead of blocking the probe", async () => {
    vi.useFakeTimers();
    ping.mockReturnValue(new Promise(() => undefined));
    const result = checkHealth();
    await vi.advanceTimersByTimeAsync(3100);
    expect((await result).checks.redis).toBe("fail");
    vi.useRealTimers();
  });
});
