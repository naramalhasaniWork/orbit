import { getRedis } from "@/lib/redis";
import { ServiceUnavailableError } from "@/lib/utils/api";

export const WORKERS_UNAVAILABLE_MESSAGE =
  "Background workers unavailable: Redis is not reachable";

const PING_TIMEOUT_MS = 2000;
const QUEUE_OP_TIMEOUT_MS = 5000;

function timeout<T>(op: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return Promise.race([
    op,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * ioredis and BullMQ queue commands while Redis is down instead of failing,
 * so an unguarded enqueue hangs the request. Ping first, with a deadline.
 */
export async function isQueueReachable(): Promise<boolean> {
  try {
    await timeout(getRedis().ping(), PING_TIMEOUT_MS);
    return true;
  } catch {
    return false;
  }
}

export async function requireQueueAvailable(): Promise<void> {
  if (!(await isQueueReachable())) {
    throw new ServiceUnavailableError(WORKERS_UNAVAILABLE_MESSAGE, "WORKERS_UNAVAILABLE");
  }
}

/** Bounds a queue operation; a hang or failure becomes a 503-mapped error. */
export async function withQueueTimeout<T>(op: Promise<T>): Promise<T> {
  try {
    return await timeout(op, QUEUE_OP_TIMEOUT_MS);
  } catch (err) {
    console.error("[queue] Operation failed:", err instanceof Error ? err.message : err);
    throw new ServiceUnavailableError(WORKERS_UNAVAILABLE_MESSAGE, "WORKERS_UNAVAILABLE");
  }
}
