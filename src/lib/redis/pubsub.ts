import { createRedisConnection } from "@/lib/redis";

type MessageCallback = (data: unknown) => void;

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
        const data: unknown = JSON.parse(message);
        callbacks.forEach((cb) => {
          try {
            cb(data);
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

export async function publish(channel: string, data: unknown): Promise<void> {
  try {
    const client = getPubClient();
    await client.publish(channel, JSON.stringify(data));
  } catch (err) {
    console.error(`[PubSub] Failed to publish to ${channel}:`, err);
  }
}

export async function subscribe(
  channel: string,
  callback: MessageCallback
): Promise<() => Promise<void>> {
  const client = getSubClient();

  if (!subscriptions.has(channel)) {
    subscriptions.set(channel, new Set());
    await client.subscribe(channel);
  }

  const callbacks = subscriptions.get(channel)!;
  callbacks.add(callback);

  return async () => {
    callbacks.delete(callback);
    if (callbacks.size === 0) {
      subscriptions.delete(channel);
      await client.unsubscribe(channel);
    }
  };
}

// Channel name helpers
export const channels = {
  runProgress: (runId: string) => `run:${runId}:progress`,
  indexingProgress: (projectId: string) => `index:${projectId}:progress`,
  workspaceEvents: (workspaceId: string) => `workspace:${workspaceId}:events`,
  projectEvents: (projectId: string) => `project:${projectId}:events`,
} as const;
