import { replayLatest, replaySince, subscribe } from "@/lib/redis/pubsub";
import { compareStreamIds, isStreamId } from "@/lib/sse/stream-id";
import type { WebSocketEvent } from "@/lib/websocket/channels";
import type { LoggedEvent } from "@/server/realtime/event-log";

const HEARTBEAT_INTERVAL_MS = 15_000;
const MAX_STREAM_DURATION_MS = 10 * 60 * 1000; // 10 minutes

interface SSEInitialEvent {
  type: string;
  payload: unknown;
}

interface SSEStreamOptions {
  channel: string;
  lastEventId?: string | null;
  onEvent?: (event: WebSocketEvent) => boolean | void;
  /** State snapshots to send on connection, before replayed and live events. They carry no event id. */
  initialEvents?: SSEInitialEvent[];
  /** On a first connection (no Last-Event-ID), start from the newest N logged events instead of nothing. */
  latestCount?: number;
}

const SUBSCRIBE_TIMEOUT_MS = 3000;

export const PUBSUB_UNAVAILABLE_MESSAGE =
  "Live updates unavailable: Redis is not reachable";

/** ioredis queues commands while disconnected, so every Redis call made before the response starts is bounded. */
async function withTimeout<T>(pending: Promise<T>, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${what} timed out`)), SUBSCRIBE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Subscribes before any bytes are sent, so a pub/sub outage surfaces as a
 * 503 the client backs off from, not a 200 stream that immediately errors.
 */
async function subscribeWithTimeout(
  channel: string,
  callback: (data: unknown, id: string) => void
): Promise<() => Promise<void>> {
  const pending = subscribe(channel, callback);
  try {
    return await withTimeout(pending, "subscribe");
  } catch (err) {
    // If the subscribe eventually lands, release it.
    pending.then((unsub) => unsub()).catch(() => {});
    throw err;
  }
}

/**
 * Creates an SSE Response that follows a channel. Events flow: service
 * publishes -> Redis stream + pub/sub -> this endpoint -> client, and each
 * SSE `id:` is the Redis stream entry id.
 *
 * On connect it subscribes first (buffering live events), then replays what
 * the client missed from the stream (Last-Event-ID), then goes live, skipping
 * anything it already sent. Returns a 503 when Redis is unavailable. The
 * stream closes after MAX_STREAM_DURATION_MS (the client reconnects and
 * replays) or when the client disconnects.
 */
export async function createSSEStream({
  channel,
  lastEventId,
  onEvent,
  initialEvents,
  latestCount,
}: SSEStreamOptions): Promise<Response> {
  const encoder = new TextEncoder();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  // Live events that arrive while the replay is being read wait here.
  const pending: LoggedEvent[] = [];
  let deliver: (event: WebSocketEvent, id: string) => void = (event, id) => {
    pending.push({ id, event });
  };

  let unsubscribe: () => Promise<void>;
  try {
    unsubscribe = await subscribeWithTimeout(channel, (data, id) => deliver(data as WebSocketEvent, id));
  } catch (err) {
    console.error(`[SSE] Failed to subscribe to ${channel}:`, err instanceof Error ? err.message : err);
    return unavailable();
  }

  let replay: LoggedEvent[] = [];
  let gap: { firstAvailableId: string } | null = null;
  try {
    if (isStreamId(lastEventId)) {
      ({ events: replay, gap } = await withTimeout(replaySince(channel, lastEventId), "replay"));
    } else if (latestCount) {
      replay = await withTimeout(replayLatest(channel, latestCount), "replay");
    }
  } catch (err) {
    // Going live without the gap would lose events silently; let the client retry instead.
    console.error(`[SSE] Failed to replay ${channel}:`, err instanceof Error ? err.message : err);
    unsubscribe().catch(() => {});
    return unavailable();
  }

  const stream = new ReadableStream({
    start(controller) {
      let lastSentId: string | null = null;

      const send = (eventType: string, data: unknown, id?: string) => {
        if (closed) return;
        const lines = [
          ...(id ? [`id: ${id}`] : []),
          `event: ${eventType}`,
          `data: ${JSON.stringify(data)}`,
          "",
          "",
        ].join("\n");
        try {
          controller.enqueue(encoder.encode(lines));
        } catch {
          cleanup();
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        unsubscribe().catch(() => {});
        try {
          controller.close();
        } catch {
          // Already closed
        }
      };

      const emit = (event: WebSocketEvent, id: string) => {
        if (closed) return;
        // A live event can also be in the replayed gap; ids only move forward.
        if (isStreamId(id) && lastSentId && compareStreamIds(id, lastSentId) <= 0) return;
        if (isStreamId(id)) lastSentId = id;
        // Allow caller to intercept and decide to close
        const terminal = onEvent?.(event) === true;
        send(event.type, event.payload, id);
        if (terminal) cleanup();
      };

      // Connection events carry no id, so they never move the client's Last-Event-ID.
      send("connected", { channel, timestamp: Date.now() });
      for (const evt of initialEvents ?? []) send(evt.type, evt.payload);
      // The log was trimmed past this client's position: tell it to refetch state.
      if (gap) send("replay_gap", { channel, lastEventId, firstAvailableId: gap.firstAvailableId });

      for (const { id, event } of replay) emit(event as WebSocketEvent, id);
      for (const { id, event } of pending.splice(0)) emit(event as WebSocketEvent, id);
      deliver = emit;
      if (closed) return; // a replayed terminal event already ended the stream

      heartbeatTimer = setInterval(() => send("heartbeat", { timestamp: Date.now() }), HEARTBEAT_INTERVAL_MS);

      timeoutTimer = setTimeout(() => {
        send("timeout", { message: "Stream duration limit reached" });
        cleanup();
      }, MAX_STREAM_DURATION_MS);
    },

    cancel() {
      closed = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      unsubscribe().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function unavailable(): Response {
  return new Response(PUBSUB_UNAVAILABLE_MESSAGE, {
    status: 503,
    headers: { "Retry-After": "30", "Content-Type": "text/plain" },
  });
}
