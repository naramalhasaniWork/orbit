import type { ConnectionOptions } from "bullmq";

function parseRedisUrl(url: string): ConnectionOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port, 10),
    password: parsed.password || undefined,
    username: parsed.username !== "default" ? parsed.username : undefined,
    maxRetriesPerRequest: null,
  };
}

let connectionConfig: ConnectionOptions | null = null;

export function getQueueConnection(): ConnectionOptions {
  if (!connectionConfig) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error("REDIS_URL environment variable is not set");
    }
    connectionConfig = parseRedisUrl(url);
  }
  return connectionConfig;
}
