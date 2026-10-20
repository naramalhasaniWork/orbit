import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { subscribe } = vi.hoisted(() => ({ subscribe: vi.fn() }));
vi.mock("@/lib/redis/pubsub", () => ({ subscribe }));

import { createSSEStream, PUBSUB_UNAVAILABLE_MESSAGE } from "@/lib/sse/stream";

describe("createSSEStream", () => {
  beforeEach(() => {
    subscribe.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => vi.useRealTimers());

  it("returns 503 instead of a 200 error stream when pub/sub rejects", async () => {
    subscribe.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await createSSEStream({ channel: "project:p1:events" });
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(await res.text()).toBe(PUBSUB_UNAVAILABLE_MESSAGE);
  });

  it("returns 503 when the subscribe hangs (ioredis offline queue)", async () => {
    vi.useFakeTimers();
    subscribe.mockReturnValue(new Promise(() => undefined));
    const pending = createSSEStream({ channel: "project:p1:events" });
    await vi.advanceTimersByTimeAsync(3000);
    expect((await pending).status).toBe(503);
  });

  it("streams a connected event once subscribed", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    subscribe.mockResolvedValue(unsubscribe);
    const res = await createSSEStream({ channel: "project:p1:events" });
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toContain("event: connected");
    await reader.cancel();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
