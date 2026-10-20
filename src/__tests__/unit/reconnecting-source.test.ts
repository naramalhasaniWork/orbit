import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  backoffDelay,
  openReconnectingSource,
  type EventSourceLike,
  type SSEStatus,
} from "@/lib/sse/reconnecting-source";

interface FakeSource extends EventSourceLike {
  url: string;
  closed: boolean;
  listeners: Map<string, (ev: MessageEvent) => void>;
  emit: (type: string, data: unknown, id?: string) => void;
}

function makeFactory() {
  const sources: FakeSource[] = [];
  const create = (url: string): EventSourceLike => {
    const listeners = new Map<string, (ev: MessageEvent) => void>();
    const source: FakeSource = {
      url,
      closed: false,
      listeners,
      onopen: null,
      onerror: null,
      onmessage: null,
      addEventListener: (type, listener) => listeners.set(type, listener),
      close() {
        source.closed = true;
      },
      emit(type, data, id = "7") {
        listeners.get(type)?.({ type, data: JSON.stringify(data), lastEventId: id } as MessageEvent);
      },
    };
    sources.push(source);
    return source;
  };
  return { sources, create };
}

const open = (s: FakeSource) => s.onopen?.(new Event("open"));
const drop = (s: FakeSource) => s.onerror?.(new Event("error"));

describe("backoffDelay", () => {
  it("doubles per attempt, caps at the max, and keeps at least half the window", () => {
    expect(backoffDelay(1, 2000, 30_000, () => 0)).toBe(1000);
    expect(backoffDelay(1, 2000, 30_000, () => 1)).toBe(2000);
    expect(backoffDelay(3, 2000, 30_000, () => 1)).toBe(8000);
    expect(backoffDelay(10, 2000, 30_000, () => 1)).toBe(30_000);
    expect(backoffDelay(10, 2000, 30_000, () => 0)).toBe(15_000);
  });
});

describe("openReconnectingSource", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not reset the retry budget when the server accepts then immediately drops", () => {
    const { sources, create } = makeFactory();
    const statuses: SSEStatus[] = [];
    openReconnectingSource({
      url: "/events",
      onMessage: () => undefined,
      onStatus: (s) => statuses.push(s),
      maxRetries: 3,
      createEventSource: create,
      random: () => 1,
    });

    // Flapping server: open then error, four times.
    for (let i = 0; i < 4; i++) {
      const s = sources[sources.length - 1];
      open(s);
      drop(s);
      vi.advanceTimersByTime(60_000);
    }

    expect(sources).toHaveLength(4);
    expect(statuses[statuses.length - 1]).toMatchObject({ state: "failed", attempt: 4 });
    vi.advanceTimersByTime(10 * 60_000);
    expect(sources).toHaveLength(4);
  });

  it("schedules exactly one reconnect per failure with growing delays", () => {
    const { sources, create } = makeFactory();
    openReconnectingSource({
      url: "/events",
      onMessage: () => undefined,
      maxRetries: 10,
      createEventSource: create,
      random: () => 1,
    });

    drop(sources[0]);
    expect(sources[0].closed).toBe(true);
    vi.advanceTimersByTime(1999);
    expect(sources).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sources).toHaveLength(2);

    drop(sources[1]);
    vi.advanceTimersByTime(3999);
    expect(sources).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sources).toHaveLength(3);

    // A late error from an already-replaced source must not schedule another reconnect.
    drop(sources[0]);
    vi.advanceTimersByTime(60_000);
    expect(sources).toHaveLength(3);
  });

  it("resets the budget only after the connection stays healthy", () => {
    const { sources, create } = makeFactory();
    const statuses: SSEStatus[] = [];
    openReconnectingSource({
      url: "/events",
      onMessage: () => undefined,
      onStatus: (s) => statuses.push(s),
      createEventSource: create,
      random: () => 1,
    });

    drop(sources[0]);
    vi.advanceTimersByTime(2000);
    open(sources[1]);
    vi.advanceTimersByTime(10_000);
    drop(sources[1]);

    expect(statuses[statuses.length - 1]).toMatchObject({ state: "waiting", attempt: 1, delayMs: 2000 });
  });

  it("backs off on a server-sent error event instead of reconnecting immediately", () => {
    const { sources, create } = makeFactory();
    const statuses: SSEStatus[] = [];
    const messages: string[] = [];
    openReconnectingSource({
      url: "/events",
      onMessage: (m) => messages.push(m.type),
      onStatus: (s) => statuses.push(s),
      createEventSource: create,
      random: () => 1,
    });

    open(sources[0]);
    sources[0].emit("error", { message: "Failed to subscribe to event stream" });

    expect(messages).toEqual(["error"]);
    expect(sources[0].closed).toBe(true);
    expect(statuses[statuses.length - 1]).toMatchObject({
      state: "waiting",
      reason: "Failed to subscribe to event stream",
    });
    // The browser's own transport error that follows must not double-schedule.
    drop(sources[0]);
    vi.advanceTimersByTime(2000);
    expect(sources).toHaveLength(2);
  });

  it("resumes from the last event id and stops everything on close", () => {
    const { sources, create } = makeFactory();
    const conn = openReconnectingSource({
      url: "/progress",
      onMessage: () => undefined,
      createEventSource: create,
      random: () => 1,
    });

    open(sources[0]);
    sources[0].emit("run:progress", { status: "executing" });
    drop(sources[0]);
    vi.advanceTimersByTime(2000);
    expect(sources[1].url).toBe("/progress?lastEventId=7");

    conn.close();
    expect(sources[1].closed).toBe(true);
    drop(sources[1]);
    vi.advanceTimersByTime(10 * 60_000);
    expect(sources).toHaveLength(2);
  });

  it("drops a boundary event the server resends after a reconnect, but never a heartbeat", () => {
    const { sources, create } = makeFactory();
    const seen: string[] = [];
    openReconnectingSource({
      url: "/progress",
      onMessage: (m) => seen.push(`${m.type}:${m.id}`),
      createEventSource: create,
      random: () => 1,
    });

    open(sources[0]);
    sources[0].emit("test:step", { stepIndex: 0 }, "1700000000001-0");
    sources[0].emit("test:step", { stepIndex: 1 }, "1700000000002-0");
    drop(sources[0]);
    vi.advanceTimersByTime(2000);

    // Replay starts at the last id seen (inclusive), then new events; heartbeats repeat the old id.
    open(sources[1]);
    sources[1].emit("connected", {}, "1700000000002-0");
    sources[1].emit("test:step", { stepIndex: 1 }, "1700000000002-0");
    sources[1].emit("heartbeat", {}, "1700000000002-0");
    sources[1].emit("test:step", { stepIndex: 2 }, "1700000000003-0");

    expect(seen).toEqual([
      "test:step:1700000000001-0",
      "test:step:1700000000002-0",
      "connected:1700000000002-0",
      "heartbeat:1700000000002-0",
      "test:step:1700000000003-0",
    ]);
    expect(sources[1].url).toBe("/progress?lastEventId=1700000000002-0");
  });
});
