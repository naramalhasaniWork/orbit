import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ShutdownError, requestShutdown, isShuttingDown, throwIfShuttingDown,
  resetShutdownForTests, installShutdownHandlers,
} from "@/lib/queue/shutdown";
import { getOrbitRole, shouldStartWorkers } from "@/lib/queue/role";

describe("shutdown flag", () => {
  beforeEach(resetShutdownForTests);

  it("throws a retryable ShutdownError only once requested", () => {
    expect(() => throwIfShuttingDown()).not.toThrow();
    requestShutdown();
    expect(isShuttingDown()).toBe(true);
    try {
      throwIfShuttingDown();
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ShutdownError);
      expect((err as ShutdownError).retryable).toBe(true);
    }
  });
});

describe("installShutdownHandlers", () => {
  afterEach(() => {
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGINT");
    vi.restoreAllMocks();
    resetShutdownForTests();
  });

  it("raises the flag before draining, then exits 0; a second signal is ignored", async () => {
    const order: string[] = [];
    const exit = vi.spyOn(process, "exit").mockImplementation((() => { order.push("exit"); }) as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const drain = vi.fn(async () => { order.push(`drain(flag=${isShuttingDown()})`); });

    installShutdownHandlers(drain, "test");
    process.emit("SIGTERM");
    process.emit("SIGTERM");
    await vi.waitFor(() => expect(exit).toHaveBeenCalled());

    expect(order).toEqual(["drain(flag=true)", "exit"]);
    expect(drain).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });
});

describe("ORBIT_ROLE", () => {
  it("defaults to all and only web skips workers", () => {
    expect(getOrbitRole({})).toBe("all");
    expect(getOrbitRole({ ORBIT_ROLE: "bogus" })).toBe("all");
    expect(shouldStartWorkers({})).toBe(true);
    expect(shouldStartWorkers({ ORBIT_ROLE: "worker" })).toBe(true);
    expect(shouldStartWorkers({ ORBIT_ROLE: "WEB" })).toBe(false);
  });
});
