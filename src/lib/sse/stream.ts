import { subscribe } from "@/lib/redis/pubsub";
import type { WebSocketEvent } from "@/lib/websocket/channels";

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
  /** Events to send immediately on connection, before pub/sub messages arrive. */
  initialEvents?: SSEInitialEvent[];
}

const SUBSCRIBE_TIMEOUT_MS = 3000;

export const PUBSUB_UNAVAILABLE_MESSAGE =
  "Live updates unavailable: Redis is not reachable";

/**
 * Subscribes before any bytes are sent, so a pub/sub outage surfaces as a
 * 503 the client backs off from, not a 200 stream that immediately errors.
 * ioredis queues commands while disconnected, so the subscribe is bounded.
 */
async function subscribeWithTimeout(
  channel: string,
  callback: (data: unknown) => void
): Promise<() => Promise<void>> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const pending = subscribe(channel, callback);
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("subscribe timed out")), SUBSCRIBE_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    // If the subscribe eventually lands, release it.
    pending.then((unsub) => unsub()).catch(() => {});
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Creates an SSE Response that subscribes to a Redis pub/sub channel.
 * Events flow: service publishes -> Redis -> this SSE endpoint -> client.
 *
 * Returns a standard Response with text/event-stream headers, or a 503 when
 * pub/sub is unavailable. The stream auto-closes after MAX_STREAM_DURATION_MS
 * or when the client disconnects.
 */
export async function createSSEStream({ channel, lastEventId, onEvent, initialEvents }: SSEStreamOptions): Promise<Response> {
  const encoder = new TextEncoder();
  let eventCounter = parseInt(lastEventId ?? "0", 10) || 0;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let deliver: ((event: WebSocketEvent) => void) | null = null;

  let unsubscribe: () => Promise<void>;
  try {
    unsubscribe = await subscribeWithTimeout(channel, (data) => deliver?.(data as WebSocketEvent));
  } catch (err) {
    console.error(`[SSE] Failed to subscribe to ${channel}:`, err instanceof Error ? err.message : err);
    return new Response(PUBSUB_UNAVAILABLE_MESSAGE, {
      status: 503,
      headers: { "Retry-After": "30", "Content-Type": "text/plain" },
    });
  }

  const stream = new ReadableStream({
    start(controller) {
      const send = (eventType: string, data: unknown) => {
        if (closed) return;
        eventCounter++;
        const lines = [
          `id: ${eventCounter}`,
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

      const sendHeartbeat = () => {
        send("heartbeat", { timestamp: Date.now() });
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

      deliver = (event) => {
        if (closed) return;
        // Allow caller to intercept and decide to close
        if (onEvent?.(event) === true) {
          send(event.type, event.payload);
          cleanup();
          return;
        }
        send(event.type, event.payload);
      };

      // Send initial connected event
      send("connected", { channel, timestamp: Date.now() });

      // Send any buffered initial events (e.g., latest screenshot for late-joining clients)
      if (initialEvents) {
        for (const evt of initialEvents) {
          send(evt.type, evt.payload);
        }
      }

      // Heartbeat to keep connection alive
      heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

      // Max stream duration
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
