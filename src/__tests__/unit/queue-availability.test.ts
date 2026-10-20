import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { ping } = vi.hoisted(() => ({ ping: vi.fn() }));
vi.mock("@/lib/redis", () => ({ getRedis: () => ({ ping }) }));

import {
  requireQueueAvailable,
  withQueueTimeout,
  WORKERS_UNAVAILABLE_MESSAGE,
} from "@/lib/queue/availability";
import { handleApiError, ServiceUnavailableError } from "@/lib/utils/api";

describe("queue availability", () => {
  beforeEach(() => {
    ping.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => vi.useRealTimers());

  it("passes when Redis answers", async () => {
    ping.mockResolvedValue("PONG");
    await expect(requireQueueAvailable()).resolves.toBeUndefined();
  });

  it("fails fast with an actionable 503 when Redis hangs", async () => {
    vi.useFakeTimers();
    ping.mockReturnValue(new Promise(() => undefined));
    const check = requireQueueAvailable().catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(2000);
    const err = await check;
    expect(err).toBeInstanceOf(ServiceUnavailableError);

    const res = handleApiError(err);
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(await res.json()).toEqual({
      success: false,
      error: { message: WORKERS_UNAVAILABLE_MESSAGE, code: "WORKERS_UNAVAILABLE" },
    });
  });

  it("turns a hanging queue operation into a ServiceUnavailableError", async () => {
    vi.useFakeTimers();
    const op = withQueueTimeout(new Promise(() => undefined)).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await op).toBeInstanceOf(ServiceUnavailableError);
  });
});
