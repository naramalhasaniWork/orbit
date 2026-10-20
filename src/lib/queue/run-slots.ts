import { DelayedError, type Job } from "bullmq";
import { prisma } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { isSelfHosted } from "@/lib/self-host";
import { TIER_LIMITS } from "@/lib/auth/tier-limits";
import { RunLockedError } from "@/lib/queue/run-locked";

/**
 * Per-workspace run concurrency as a Redis lease semaphore: a ZSET
 * `ws:{id}:run-slots` of runId -> lease expiry (ms). Leases are refreshed
 * while the run executes, so a crashed worker frees its slot within one TTL.
 */
const LEASE_TTL_MS = 90_000;
const LEASE_REFRESH_MS = 30_000;
export const SLOT_RETRY_DELAY_MS = 15_000;

export const slotsKey = (workspaceId: string) => `ws:${workspaceId}:run-slots`;

// Drop expired leases, then take a slot if one is free (or we already hold one).
const ACQUIRE_LUA = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if redis.call('ZSCORE', KEYS[1], ARGV[3]) or redis.call('ZCARD', KEYS[1]) < tonumber(ARGV[4]) then
  redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
  return 1
end
return 0`;

export async function acquireRunSlot(workspaceId: string, runId: string, limit: number): Promise<boolean> {
  const now = Date.now();
  const res = await getRedis().eval(
    ACQUIRE_LUA, 1, slotsKey(workspaceId), String(now), String(now + LEASE_TTL_MS), runId, String(limit)
  );
  return res === 1;
}

export async function releaseRunSlot(workspaceId: string, runId: string): Promise<void> {
  await getRedis().zrem(slotsKey(workspaceId), runId);
}

async function refreshRunSlot(workspaceId: string, runId: string): Promise<void> {
  await getRedis().zadd(slotsKey(workspaceId), "XX", Date.now() + LEASE_TTL_MS, runId);
}

/** Concurrent-run limit for the run's workspace; Infinity when self-hosted. */
export async function resolveRunLimit(runId: string): Promise<{ workspaceId: string; limit: number } | null> {
  const run = await prisma.testRun.findUnique({
    where: { id: runId },
    select: { project: { select: { workspaceId: true, workspace: { select: { tier: true } } } } },
  });
  if (!run) return null;
  const limit = isSelfHosted() ? Infinity : TIER_LIMITS[run.project.workspace.tier].concurrentRuns;
  return { workspaceId: run.project.workspaceId, limit };
}

/** A RunLockedError becomes a delayed retry (no attempt consumed) instead of a failure. */
async function delayWhenRunLocked(job: Job, token: string | undefined, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (!(err instanceof RunLockedError)) throw err;
    await job.moveToDelayed(Date.now() + err.retryAfterMs, token);
    throw new DelayedError();
  }
}

/**
 * Run `fn` while holding one of the workspace's run slots. When the workspace
 * is at its limit the job is pushed back 15s and DelayedError tells BullMQ
 * not to count it as a failure or an attempt.
 */
export async function withRunSlot(
  job: Job,
  token: string | undefined,
  runId: string,
  work: () => Promise<void>
): Promise<void> {
  const fn = () => delayWhenRunLocked(job, token, work);
  let target: Awaited<ReturnType<typeof resolveRunLimit>>;
  try {
    target = await resolveRunLimit(runId);
  } catch (err) {
    console.error(`[RunSlots] Could not resolve limit for run ${runId}, running unthrottled:`, err);
    return fn();
  }
  if (!target || target.limit === Infinity) return fn();

  const { workspaceId, limit } = target;
  let acquired: boolean;
  try {
    acquired = await acquireRunSlot(workspaceId, runId, limit);
  } catch (err) {
    console.error(`[RunSlots] Redis error acquiring slot for run ${runId}, running unthrottled:`, err);
    return fn();
  }

  if (!acquired) {
    console.log(`[RunSlots] Workspace ${workspaceId} at ${limit} concurrent run(s); delaying run ${runId}`);
    await job.moveToDelayed(Date.now() + SLOT_RETRY_DELAY_MS, token);
    throw new DelayedError();
  }

  const refresh = setInterval(() => {
    refreshRunSlot(workspaceId, runId).catch((err) =>
      console.warn(`[RunSlots] Lease refresh failed for run ${runId}:`, err)
    );
  }, LEASE_REFRESH_MS);
  try {
    await fn();
  } finally {
    clearInterval(refresh);
    await releaseRunSlot(workspaceId, runId).catch((err) =>
      console.warn(`[RunSlots] Release failed for run ${runId}:`, err)
    );
  }
}
