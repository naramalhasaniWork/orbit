import { createHash } from "node:crypto";
import type { Queue } from "bullmq";

const IN_FLIGHT = new Set(["active", "waiting", "delayed", "prioritized", "waiting-children"]);

/**
 * Enqueue under a deterministic job id. BullMQ silently ignores an add whose
 * id already exists, including a finished or failed job still retained in
 * Redis, which would swallow legitimate re-requests. So: an in-flight job
 * with this id dedupes the add; a finished one is removed first.
 */
export async function addDeterministicJob<T>(
  queue: Queue<T>,
  name: string,
  data: T,
  jobId: string,
  opts: { removeFinished?: boolean } = {}
): Promise<{ deduped: boolean }> {
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (IN_FLIGHT.has(state)) return { deduped: true };
    if (opts.removeFinished !== false) await existing.remove();
  }
  // Names/data are validated by the caller's queue schema; BullMQ's generic is invariant.
  await (queue as Queue).add(name, data, { jobId });
  return { deduped: false };
}

/** Stable short hash of plan inputs: same inputs, same job id. */
export function hashInputs(inputs: Record<string, unknown>): string {
  const canonical = JSON.stringify(inputs, (_k, v) =>
    Array.isArray(v) && v.every((x) => typeof x === "string") ? [...v].sort() : v
  );
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}
