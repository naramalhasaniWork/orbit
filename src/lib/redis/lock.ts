import { getRedis } from "@/lib/redis";

export interface Lock {
  key: string;
  acquired: boolean;
  refreshInterval?: ReturnType<typeof setInterval>;
}

const DEFAULT_TTL_SECONDS = 60;
const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

/**
 * Acquire a distributed lock via Redis SET NX with TTL.
 * Retries with exponential backoff. Auto-refreshes TTL at half-TTL intervals.
 */
export async function acquireLock(
  key: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
  retries: number = DEFAULT_RETRIES,
  retryDelayMs: number = DEFAULT_RETRY_DELAY_MS
): Promise<Lock> {
  const redis = getRedis();
  const lockKey = `orbit:lock:${key}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await redis.set(lockKey, "locked", "EX", ttlSeconds, "NX");

    if (result === "OK") {
      const refreshMs = (ttlSeconds * 1000) / 2;
      const refreshInterval = setInterval(() => {
        redis.expire(lockKey, ttlSeconds).catch((err) => {
          console.warn(`[Lock] Failed to refresh TTL for ${lockKey}:`, err);
        });
      }, refreshMs);

      return { key: lockKey, acquired: true, refreshInterval };
    }

    if (attempt < retries) {
      const delay = retryDelayMs * Math.pow(2, attempt);
      console.log(`[Lock] ${lockKey} held by another process, retry ${attempt + 1}/${retries} in ${delay}ms`);
      await sleep(delay);
    }
  }

  console.warn(`[Lock] Failed to acquire ${lockKey} after ${retries + 1} attempts`);
  return { key: lockKey, acquired: false };
}

/**
 * Release a distributed lock: clears the refresh interval and deletes the key.
 */
export async function releaseLock(lock: Lock): Promise<void> {
  if (lock.refreshInterval) {
    clearInterval(lock.refreshInterval);
  }

  if (lock.acquired) {
    const redis = getRedis();
    try {
      await redis.del(lock.key);
    } catch (err) {
      console.warn(`[Lock] Failed to release ${lock.key}:`, err);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
