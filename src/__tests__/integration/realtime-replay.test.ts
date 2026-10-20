import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/redis", async () => (await import("../helpers/fake-redis")).redisMock());

import { fakeRedis as redis } from "../helpers/fake-redis";
import { channels, publish } from "@/lib/redis/pubsub";
import { emitTestStep } from "@/lib/websocket";
import { createSSEStream } from "@/lib/sse/stream";
import { openReconnectingSource, type EventSourceLike, type SSEMessage } from "@/lib/sse/reconnecting-source";
import { compareStreamIds } from "@/lib/sse/stream-id";

const RUN = "run-1";
const CHANNEL = channels.runProgress(RUN);
const step = (stepIndex: number) =>
  emitTestStep(RUN, { runId: RUN, testCaseId: "tc-1", stepIndex, action: `step ${stepIndex}`, status: "passed" });

const until = async (cond: () => boolean, what: string) => {
  for (let i = 0; i < 400; i++) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`timed out waiting for ${what}`);
};

/** Parses an SSE body into events and tracks lastEventId the way a browser EventSource does. */
class StreamSource implements EventSourceLike {
  onopen: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  private listeners = new Map<string, (ev: MessageEvent) => void>();
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private lastEventId = "";
  closed = false;

  constructor(url: string) {
    void this.run(url);
  }

  addEventListener(type: string, listener: (ev: MessageEvent) => void) {
    this.listeners.set(type, listener);
  }

  close() {
    this.closed = true;
    void this.reader?.cancel();
  }

  /** The network dies: the stream stops and the browser reports an error. */
  drop() {
    void this.reader?.cancel();
    this.onerror?.(new Event("error"));
  }

  private async run(url: string) {
    const lastEventId = new URL(url, "http://localhost").searchParams.get("lastEventId");
    const res = await createSSEStream({ channel: CHANNEL, lastEventId });
    if (res.status !== 200) {
      this.onerror?.(new Event("error"));
      return;
    }
    this.onopen?.(new Event("open"));
    this.reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await this.reader.read().catch(() => ({ done: true, value: undefined }));
      if (done || this.closed) return;
      buffer += decoder.decode(value);
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) this.dispatch(frame);
    }
  }

  private dispatch(frame: string) {
    const field = (name: string) => frame.split("\n").find((l) => l.startsWith(`${name}: `))?.slice(name.length + 2);
    const id = field("id");
    if (id) this.lastEventId = id;
    const type = field("event") ?? "message";
    this.listeners.get(type)?.({ type, data: field("data"), lastEventId: this.lastEventId } as MessageEvent);
  }
}

describe("realtime replay on reconnect", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    redis.streams.clear();
    redis.published = [];
    redis.down = false;
    redis.beforeXrange = null;
  });
  afterEach(() => vi.restoreAllMocks());

  it("loses no step events when the connection drops mid-run", async () => {
    const sources: StreamSource[] = [];
    const received: SSEMessage[] = [];
    let opens = 0;
    const client = openReconnectingSource({
      url: `/progress`,
      baseDelayMs: 5,
      random: () => 0,
      createEventSource: (url) => {
        const s = new StreamSource(url);
        sources.push(s);
        return s;
      },
      onMessage: (m) => received.push(m),
      onStatus: (s) => {
        if (s.state === "open") opens++;
      },
    });
    const steps = () => received.filter((m) => m.type === "test:step").map((m) => (m.data as { stepIndex: number }).stepIndex);

    await until(() => opens === 1, "first connection");
    for (const i of [0, 1, 2]) await step(i);
    await until(() => steps().length === 3, "first three steps");

    sources[0].drop();
    for (const i of [3, 4, 5]) await step(i); // published while nobody is connected

    await until(() => opens === 2, "reconnect");
    await step(6);
    await until(() => steps().length === 7, "replayed and live steps");

    expect(steps()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const ids = received.filter((m) => m.type === "test:step").map((m) => m.id);
    expect(ids.every((id, i) => i === 0 || compareStreamIds(id, ids[i - 1]) > 0)).toBe(true);
    expect(sources[1]).toBeDefined();
    client.close();
  });

  it("sends an event that is both in the replayed gap and live exactly once", async () => {
    await step(0);
    const [first] = redis.streams.get(`rt:${CHANNEL}`)!;
    // Lands after the subscribe but before the gap is read: in the stream and on the live channel.
    redis.beforeXrange = async () => {
      redis.beforeXrange = null;
      await step(1);
    };
    const res = await createSSEStream({ channel: CHANNEL, lastEventId: first[0] });
    const reader = res.body!.getReader();
    await step(2);
    let text = "";
    const decoder = new TextDecoder();
    while (!text.includes('"stepIndex":2')) text += decoder.decode((await reader.read()).value);
    await reader.cancel();

    expect(text.match(/"stepIndex":1/g)).toHaveLength(1);
    expect(text).not.toContain('"stepIndex":0');
  });

  it("starts a first-time viewer from the newest logged event when asked to", async () => {
    await step(0);
    await step(1);
    const res = await createSSEStream({ channel: CHANNEL, latestCount: 1 });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (!text.includes("stepIndex")) text += decoder.decode((await reader.read()).value);
    await reader.cancel();
    expect(text).toContain('"stepIndex":1');
    expect(text).not.toContain('"stepIndex":0');
    expect(text).toMatch(/id: \d+-\d+\nevent: test:step/);
  });

  it("answers 503 when Redis is down, and when the replay cannot be read", async () => {
    redis.down = true;
    expect((await createSSEStream({ channel: CHANNEL })).status).toBe(503);

    redis.down = false;
    await step(0);
    redis.beforeXrange = async () => {
      redis.down = true;
    };
    const res = await createSSEStream({ channel: CHANNEL, lastEventId: redis.streams.get(`rt:${CHANNEL}`)![0][0] });
    expect(res.status).toBe(503);
  });

  it("keeps the log bounded and expires it 24h after the last event", async () => {
    await step(0);
    expect(redis.ttls.get(`rt:${CHANNEL}`)).toBe(24 * 60 * 60);

    for (let i = 0; i < 2100; i++) await publish("bounded:test", { type: "heartbeat", payload: { i } });
    expect(redis.streams.get("rt:bounded:test")!.length).toBeLessThanOrEqual(2000);
  });
});
