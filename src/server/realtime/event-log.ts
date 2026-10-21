import type Redis from "ioredis";
import { compareStreamIds, isStreamId } from "@/lib/sse/stream-id";

/** Largest message the bus will carry: the PUBLISH envelope and the stream entry. */
export const BUS_MAX_BYTES = 4096;

const ENVELOPE_BYTES = 64;
const STREAM_MAXLEN = 2000;
/** Each publish renews this, so a run's stream dies 24h after its terminal event. */
const STREAM_TTL_SECONDS = 24 * 60 * 60;
/** A single oversized string field is cut to this before the event is given up on. */
const CLIPPED_FIELD_CHARS = 512;
const REPLAY_BATCH = STREAM_MAXLEN;

export interface LoggedEvent {
  id: string;
  event: unknown;
}

export const streamKey = (channel: string) => `rt:${channel}`;

const byteLength = (s: string) => Buffer.byteLength(s, "utf8");

/** Shortens long top-level strings in a payload so a long error message cannot sink a terminal event. */
function clipLongStrings(event: unknown): unknown {
  if (!event || typeof event !== "object") return event;
  const { payload, ...rest } = event as { payload?: unknown };
  if (!payload || typeof payload !== "object") return event;
  const clipped = Object.fromEntries(
    Object.entries(payload).map(([k, v]) =>
      typeof v === "string" && v.length > CLIPPED_FIELD_CHARS ? [k, `${v.slice(0, CLIPPED_FIELD_CHARS)}…`] : [k, v]
    )
  );
  return { ...rest, payload: clipped };
}

/** XADD + EXPIRE + PUBLISH as one atomic round trip: the envelope needs the id XADD returns. */
const APPEND_AND_PUBLISH = `
local id = redis.call('XADD', KEYS[1], 'MAXLEN', '~', ARGV[1], '*', 'd', ARGV[2])
redis.call('EXPIRE', KEYS[1], ARGV[3])
redis.call('PUBLISH', KEYS[2], '{"id":"' .. id .. '","event":' .. ARGV[2] .. '}')
return id
`;

/**
 * XADD the event to the channel's stream, then PUBLISH {id, event} to live
 * subscribers (one Lua call). The stream is the source of truth: a subscriber that was
 * disconnected replays from it. Returns null when the event exceeds the bus
 * size limit even after clipping (it is dropped, loudly).
 */
export async function appendAndPublish(client: Redis, channel: string, event: unknown): Promise<string | null> {
  // The envelope adds {"id":"<ms>-<seq>","event":} (< 64 bytes) around the body.
  const fits = (s: string) => byteLength(s) + ENVELOPE_BYTES <= BUS_MAX_BYTES;
  let body = JSON.stringify(event);
  if (!fits(body)) body = JSON.stringify(clipLongStrings(event));
  if (!fits(body)) {
    const type = (event as { type?: unknown } | null)?.type;
    console.error(`[Bus] Dropped ${String(type)} on ${channel}: ${byteLength(body)} bytes exceeds ${BUS_MAX_BYTES}`);
    return null;
  }

  const id = await client.eval(APPEND_AND_PUBLISH, 2, streamKey(channel), channel, STREAM_MAXLEN, body, STREAM_TTL_SECONDS);
  return typeof id === "string" ? id : null;
}

function parseEntries(rows: Array<[string, string[]]>): LoggedEvent[] {
  const events: LoggedEvent[] = [];
  for (const [id, fields] of rows) {
    const at = fields.indexOf("d");
    if (at < 0) continue;
    try {
      events.push({ id, event: JSON.parse(fields[at + 1]) });
    } catch {
      // a corrupt entry is skipped, not fatal to the replay
    }
  }
  return events;
}

export interface Replay {
  events: LoggedEvent[];
  /** The log no longer reaches back to lastId: it was trimmed past MAXLEN, so events were missed. */
  gap: { firstAvailableId: string } | null;
}

/** Events strictly after `lastId`, oldest first, and whether any older ones are gone. */
export async function readSince(client: Redis, channel: string, lastId: string): Promise<Replay> {
  if (!isStreamId(lastId)) return { events: [], gap: null };
  const key = streamKey(channel);
  const [rows, head] = await Promise.all([
    client.xrange(key, lastId, "+", "COUNT", REPLAY_BATCH + 1),
    client.xrange(key, "-", "+", "COUNT", 1),
  ]);
  const first = head[0]?.[0];
  return {
    events: parseEntries(rows).filter((e) => e.id !== lastId),
    gap: first && compareStreamIds(lastId, first) < 0 ? { firstAvailableId: first } : null,
  };
}

/** The newest `count` events, oldest first. */
export async function readLatest(client: Redis, channel: string, count: number): Promise<LoggedEvent[]> {
  const rows = await client.xrevrange(streamKey(channel), "+", "-", "COUNT", count);
  return parseEntries(rows).reverse();
}
