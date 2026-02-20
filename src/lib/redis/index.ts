import Redis from "ioredis";

let redisInstance: Redis | null = null;

function createRedisConnection(label = "default"): Redis {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL environment variable is not set");
  }

  const connection = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 5000);
      console.log(`[Redis:${label}] Retry attempt ${times}, delay ${delay}ms`);
      return delay;
    },
  });

  connection.on("connect", () => {
    console.log(`[Redis:${label}] Connected`);
  });

  connection.on("error", (err) => {
    console.error(`[Redis:${label}] Connection error:`, err.message);
  });

  connection.on("close", () => {
    console.log(`[Redis:${label}] Connection closed`);
  });

  return connection;
}

export function getRedis(): Redis {
  if (!redisInstance) {
    redisInstance = createRedisConnection("main");
  }
  return redisInstance;
}

export const redis = new Proxy({} as Redis, {
  get(_target, prop: string | symbol) {
    const instance = getRedis();
    const value = instance[prop as keyof Redis];
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  },
});

export { createRedisConnection };
