import { vi } from "vitest";
import { BUS_MAX_BYTES } from "@/server/realtime/event-log";

type Entry = [id: string, fields: string[]];
type MessageListener = (channel: string, message: string) => void;

/**
 * In-memory Redis with the stream semantics the realtime layer relies on: XADD with
 * monotonic "<ms>-<seq>" ids, MAXLEN trimming, XRANGE/XREVRANGE, EXPIRE, and PUBLISH
 * fan-out to subscriber connections. Every PUBLISH is recorded for size assertions.
 */
export class FakeRedis {
  streams = new Map<string, Entry[]>();
  ttls = new Map<string, number>();
  buffers = new Map<string, Buffer>();
  published: Array<{ channel: string; message: string }> = [];
  private subscribers = new Set<FakeConnection>();
  private clock = 1_700_000_000_000;
  private lastId = { ms: 0, seq: 0 };
  /** Runs inside XRANGE before it reads, to stage an event landing mid-replay. */
  beforeXrange: (() => Promise<void>) | null = null;

  /** A fresh ioredis-shaped connection; pass as `createRedisConnection`. */
  connect(): FakeConnection {
    return new FakeConnection(this);
  }

  attach(conn: FakeConnection) {
    this.subscribers.add(conn);
  }

  async xadd(key: string, ...args: Array<string | number>): Promise<string> {
    const fields = args.slice(args.indexOf("*") + 1).map(String);
    const maxlen = args[0] === "MAXLEN" ? Number(args[2]) : Infinity;
    this.clock += 1;
    this.lastId = this.clock === this.lastId.ms ? { ms: this.clock, seq: this.lastId.seq + 1 } : { ms: this.clock, seq: 0 };
    const id = `${this.lastId.ms}-${this.lastId.seq}`;
    const entries = this.streams.get(key) ?? [];
    entries.push([id, fields]);
    while (entries.length > maxlen) entries.shift();
    this.streams.set(key, entries);
    return id;
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.ttls.set(key, seconds);
    return 1;
  }

  async xrange(key: string, start: string, _end: string, ...opts: Array<string | number>): Promise<Entry[]> {
    await this.beforeXrange?.();
    if (this.down) throw new Error("ECONNRESET");
    const count = opts[0] === "COUNT" ? Number(opts[1]) : Infinity;
    const entries = (this.streams.get(key) ?? []).filter(([id]) => start === "-" || cmp(id, start) >= 0);
    return entries.slice(0, count);
  }

  async xrevrange(key: string, _end: string, _start: string, ...opts: Array<string | number>): Promise<Entry[]> {
    const count = opts[0] === "COUNT" ? Number(opts[1]) : Infinity;
    return [...(this.streams.get(key) ?? [])].reverse().slice(0, count);
  }

  async publish(channel: string, message: string): Promise<number> {
    this.published.push({ channel, message });
    Array.from(this.subscribers).forEach((sub) => sub.deliver(channel, message));
    return this.subscribers.size;
  }

  async set(key: string, value: Buffer | string, _ex?: string, ttl?: number): Promise<"OK"> {
    this.buffers.set(key, Buffer.from(value));
    if (ttl) this.ttls.set(key, ttl);
    return "OK";
  }

  async getBuffer(key: string): Promise<Buffer | null> {
    return this.buffers.get(key) ?? null;
  }

  /** Redis is "down": every command on every connection rejects. */
  down = false;
}

export class FakeConnection {
  private listener: MessageListener | null = null;
  private channels = new Set<string>();

  constructor(private readonly redis: FakeRedis) {
    redis.attach(this);
  }

  on(event: string, listener: MessageListener) {
    if (event === "message") this.listener = listener;
    return this;
  }

  deliver(channel: string, message: string) {
    if (this.channels.has(channel)) this.listener?.(channel, message);
  }

  private guard<T>(op: () => Promise<T>): Promise<T> {
    return this.redis.down ? Promise.reject(new Error("ECONNREFUSED")) : op();
  }

  subscribe = (channel: string) =>
    this.guard(async () => {
      this.channels.add(channel);
      return 1;
    });
  unsubscribe = async (channel: string) => {
    this.channels.delete(channel);
  };
  xadd = (...a: Parameters<FakeRedis["xadd"]>) => this.guard(() => this.redis.xadd(...a));
  expire = (...a: Parameters<FakeRedis["expire"]>) => this.guard(() => this.redis.expire(...a));
  xrange = (...a: Parameters<FakeRedis["xrange"]>) => this.guard(() => this.redis.xrange(...a));
  xrevrange = (...a: Parameters<FakeRedis["xrevrange"]>) => this.guard(() => this.redis.xrevrange(...a));
  publish = (...a: Parameters<FakeRedis["publish"]>) => this.guard(() => this.redis.publish(...a));
}

function cmp(a: string, b: string): number {
  const [aMs, aSeq] = a.split("-").map(Number);
  const [bMs, bSeq] = b.split("-").map(Number);
  return aMs !== bMs ? aMs - bMs : aSeq - bSeq;
}

/** The one fake shared by the mocked "@/lib/redis" and the test body. */
export const fakeRedis = new FakeRedis();

/** Factory for vi.mock("@/lib/redis", ...): connections and getRedis share the fakeRedis singleton. */
export function redisMock(redis: FakeRedis = fakeRedis) {
  return {
    createRedisConnection: vi.fn(() => redis.connect()),
    getRedis: () => redis,
  };
}

/** Fails when any message that crossed the bus (PUBLISH envelope or stream entry) exceeds the 4KB limit. */
export function assertBusMessagesWithinLimit(redis: FakeRedis): void {
  const oversized: string[] = [];
  for (const { channel, message } of redis.published) {
    const bytes = Buffer.byteLength(message, "utf8");
    if (bytes > BUS_MAX_BYTES) oversized.push(`PUBLISH ${channel}: ${bytes} bytes`);
  }
  redis.streams.forEach((entries, key) => {
    for (const [id, fields] of entries) {
      const bytes = Buffer.byteLength(fields.join(""), "utf8");
      if (bytes > BUS_MAX_BYTES) oversized.push(`XADD ${key} ${id}: ${bytes} bytes`);
    }
  });
  if (oversized.length > 0) throw new Error(`Bus messages over ${BUS_MAX_BYTES} bytes:\n${oversized.join("\n")}`);
}
