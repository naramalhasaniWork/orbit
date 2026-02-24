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

/**
 * Creates an SSE Response that subscribes to a Redis pub/sub channel.
 * Events flow: service publishes -> Redis -> this SSE endpoint -> client.
 *
 * Returns a standard Response with text/event-stream headers.
 * The stream auto-closes after MAX_STREAM_DURATION_MS or when the
 * client disconnects.
 */
export function createSSEStream({ channel, lastEventId, onEvent, initialEvents }: SSEStreamOptions): Response {
  const encoder = new TextEncoder();
  let eventCounter = parseInt(lastEventId ?? "0", 10) || 0;
  let unsubscribe: (() => Promise<void>) | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
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
        unsubscribe?.().catch(() => {});
        try {
          controller.close();
        } catch {
          // Already closed
        }
      };

      // Subscribe to Redis channel
      try {
        unsubscribe = await subscribe(channel, (data) => {
          if (closed) return;
          const event = data as WebSocketEvent;

          // Allow caller to intercept and decide to close
          if (onEvent) {
            const shouldClose = onEvent(event);
            if (shouldClose === true) {
              send(event.type, event.payload);
              cleanup();
              return;
            }
          }

          send(event.type, event.payload);
        });
      } catch (err) {
        send("error", { message: "Failed to subscribe to event stream" });
        console.error(`[SSE] Failed to subscribe to ${channel}:`, err);
        cleanup();
        return;
      }

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
      unsubscribe?.().catch(() => {});
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
