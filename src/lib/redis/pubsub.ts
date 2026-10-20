import { createRedisConnection } from "@/lib/redis";
import { appendAndPublish, readLatest, readSince, type LoggedEvent } from "@/server/realtime/event-log";

/** Receives the event and its stream entry id (the SSE event id). */
type MessageCallback = (data: unknown, id: string) => void;

let pubClient: ReturnType<typeof createRedisConnection> | null = null;
let subClient: ReturnType<typeof createRedisConnection> | null = null;

const subscriptions = new Map<string, Set<MessageCallback>>();

function getPubClient() {
  if (!pubClient) {
    pubClient = createRedisConnection("pub");
  }
  return pubClient;
}

function getSubClient() {
  if (!subClient) {
    subClient = createRedisConnection("sub");

    subClient.on("message", (channel: string, message: string) => {
      const callbacks = subscriptions.get(channel);
      if (!callbacks) return;

      try {
        const { id, event } = JSON.parse(message) as { id: string; event: unknown };
        callbacks.forEach((cb) => {
          try {
            cb(event, id);
          } catch (err) {
            console.error(`[PubSub] Callback error on channel ${channel}:`, err);
          }
        });
      } catch (err) {
        console.error(`[PubSub] Failed to parse message on channel ${channel}:`, err);
      }
    });
  }
  return subClient;
}

/**
 * Appends the event to the channel's replayable stream (rt:{channel}) and
 * publishes it live. Resolves to the stream entry id, or null when the
 * publish failed or the event was too large for the bus.
 */
export async function publish(channel: string, data: unknown): Promise<string | null> {
  try {
    return await appendAndPublish(getPubClient(), channel, data);
  } catch (err) {
    console.error(`[PubSub] Failed to publish to ${channel}:`, err);
    return null;
  }
}

/** Events published after `lastId`, for a client that reconnected. Throws when Redis is unreachable. */
export function replaySince(channel: string, lastId: string): Promise<LoggedEvent[]> {
  return readSince(getPubClient(), channel, lastId);
}

/** The newest `count` events, for a client joining mid-run. Throws when Redis is unreachable. */
export function replayLatest(channel: string, count: number): Promise<LoggedEvent[]> {
  return readLatest(getPubClient(), channel, count);
}

const channelReady = new Map<string, Promise<unknown>>();

/**
 * Subscribes to a channel. Concurrent callers share one SUBSCRIBE; if it
 * fails, the channel is forgotten so the next caller retries instead of
 * silently attaching to a subscription that never happened.
 */
export async function subscribe(
  channel: string,
  callback: MessageCallback
): Promise<() => Promise<void>> {
  const client = getSubClient();

  let ready = channelReady.get(channel);
  if (!ready) {
    subscriptions.set(channel, new Set());
    ready = client.subscribe(channel);
    channelReady.set(channel, ready);
    ready.catch(() => {
      if (channelReady.get(channel) === ready) {
        channelReady.delete(channel);
        subscriptions.delete(channel);
      }
    });
  }
  await ready;

  const callbacks = subscriptions.get(channel)!;
  callbacks.add(callback);

  return async () => {
    callbacks.delete(callback);
    if (callbacks.size === 0 && subscriptions.get(channel) === callbacks) {
      subscriptions.delete(channel);
      channelReady.delete(channel);
      await client.unsubscribe(channel);
    }
  };
}

// Channel name helpers
export const channels = {
  runProgress: (runId: string) => `run:${runId}:progress`,
  runScreenshots: (runId: string) => `run:${runId}:screenshots`,
  indexingProgress: (projectId: string) => `index:${projectId}:progress`,
  workspaceEvents: (workspaceId: string) => `workspace:${workspaceId}:events`,
  projectEvents: (projectId: string) => `project:${projectId}:events`,
  planProgress: (projectId: string) => `plan:${projectId}:progress`,
} as const;
