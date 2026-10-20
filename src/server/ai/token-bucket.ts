// Per-workspace request pacing, so one workspace's burst cannot exhaust the platform's
// provider rate limit for everyone. In-process: each app/worker process paces separately.
// ORBIT_AI_RPM (default 120) sets the refill rate, ORBIT_AI_BURST (default 20) the capacity.

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

function limits(env: NodeJS.ProcessEnv = process.env): { perMs: number; capacity: number } {
  const rpm = Number(env.ORBIT_AI_RPM) > 0 ? Number(env.ORBIT_AI_RPM) : 120;
  const burst = Number(env.ORBIT_AI_BURST) > 0 ? Number(env.ORBIT_AI_BURST) : 20;
  return { perMs: rpm / 60_000, capacity: burst };
}

/** Milliseconds to wait before the workspace may make a call; takes a token when 0. */
export function tryTake(workspaceId: string, now: number = Date.now()): number {
  const { perMs, capacity } = limits();
  const bucket = buckets.get(workspaceId) ?? { tokens: capacity, updatedAt: now };
  bucket.tokens = Math.min(capacity, bucket.tokens + (now - bucket.updatedAt) * perMs);
  bucket.updatedAt = now;
  buckets.set(workspaceId, bucket);

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return 0;
  }
  return Math.ceil((1 - bucket.tokens) / perMs);
}

export async function acquire(
  workspaceId: string,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): Promise<void> {
  for (let wait = tryTake(workspaceId); wait > 0; wait = tryTake(workspaceId)) {
    await sleep(wait);
  }
}

export function resetBuckets(): void {
  buckets.clear();
}
