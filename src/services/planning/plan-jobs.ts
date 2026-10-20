import { getRedis } from "@/lib/redis";
import { channels, publish } from "@/lib/redis/pubsub";
import { getPlanningQueue, type PlanningJobData } from "@/lib/queue/queues";
import { addDeterministicJob, hashInputs } from "@/lib/queue/deterministic-job";
import { requireQueueAvailable, withQueueTimeout } from "@/lib/queue/availability";
import { ServiceUnavailableError } from "@/lib/utils/api";
import type { PlanJobState } from "@/lib/websocket/channels";

export type { PlanJobState };

type PlanJobOptions = Omit<Extract<PlanningJobData, { kind: "plan" }>, "kind" | "projectId">;

const STATE_TTL_SECONDS = 24 * 60 * 60;
/** A job silent this long is presumed dead (worker crash or restart). */
const STALE_AFTER_MS = 20 * 60 * 1000;

const stateKey = (projectId: string) => `plan-job:${projectId}`;

export const isTerminal = (state: PlanJobState) =>
  state.status === "completed" || state.status === "failed";

export function isStale(state: PlanJobState, now = Date.now()): boolean {
  return !isTerminal(state) && now - Date.parse(state.updatedAt) > STALE_AFTER_MS;
}

/**
 * Latest plan generation for a project. The state lives in Redis, outside
 * the request, so the UI can pick it back up after a reload.
 */
export async function readPlanJobState(projectId: string): Promise<PlanJobState | null> {
  const raw = await withQueueTimeout(getRedis().get(stateKey(projectId)));
  if (!raw) return null;
  const state = JSON.parse(raw) as PlanJobState;
  if (isStale(state)) {
    return {
      ...state,
      status: "failed",
      error: "Plan generation stopped responding. The worker may have restarted; try again.",
    };
  }
  return state;
}

/** Persists the state and fans it out to SSE subscribers. */
export async function writePlanJobState(projectId: string, state: PlanJobState): Promise<void> {
  await getRedis().set(stateKey(projectId), JSON.stringify(state), "EX", STATE_TTL_SECONDS);
  const type =
    state.status === "completed" ? "plan:completed" : state.status === "failed" ? "plan:failed" : "plan:progress";
  await publish(channels.planProgress(projectId), { type, payload: state });
}

/**
 * Queues a plan generation unless one is already in flight for the project,
 * in which case the in-flight job is returned instead of starting a second
 * (paid) generation.
 */
export async function enqueuePlanGeneration(
  projectId: string,
  options: PlanJobOptions
): Promise<{ state: PlanJobState; alreadyRunning: boolean }> {
  await requireQueueAvailable();

  // Two near-simultaneous requests (double click, StrictMode) must not both
  // pass the in-flight check below.
  const lockKey = `${stateKey(projectId)}:enqueue`;
  const claimed = await withQueueTimeout(getRedis().set(lockKey, "1", "EX", 10, "NX"));
  // The loser of the race waits briefly for the winner's queued state.
  for (let attempt = 0; ; attempt++) {
    const existing = await readPlanJobState(projectId);
    if (existing && !isTerminal(existing)) {
      if (claimed === "OK") await getRedis().del(lockKey).catch(() => undefined);
      return { state: existing, alreadyRunning: true };
    }
    if (claimed === "OK") break;
    if (attempt >= 5) {
      throw new ServiceUnavailableError(
        "A plan generation is already being queued. Try again in a few seconds.",
        "PLAN_ENQUEUE_BUSY"
      );
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  const jobId = `plan:${projectId}:${hashInputs({
    mode: options.mode,
    focusAreas: options.focusAreas ?? [],
    excludePaths: options.excludePaths ?? [],
    maxTestCases: options.maxTestCases ?? null,
  })}`;
  const state: PlanJobState = {
    jobId,
    status: "queued",
    phase: "queued",
    message: "Waiting for a worker...",
    progress: 0,
    updatedAt: new Date().toISOString(),
  };
  try {
    await withQueueTimeout(writePlanJobState(projectId, state));
    await withQueueTimeout(
      addDeterministicJob(getPlanningQueue(), "generate-plan", { kind: "plan", projectId, ...options }, jobId)
    );
  } catch (err) {
    // Don't leave a "queued" state that blocks the next attempt.
    await getRedis().del(stateKey(projectId)).catch(() => undefined);
    throw err;
  } finally {
    await getRedis().del(lockKey).catch(() => undefined);
  }
  return { state, alreadyRunning: false };
}

/** Sanitize error messages to avoid leaking internal details to clients. */
export function sanitizePlanError(error: unknown): string {
  if (!(error instanceof Error)) return "Plan generation failed";

  const safePatterns = [
    /no.*system map/i,
    /no.*test.*case/i,
    /no.*route/i,
    /project.*not.*found/i,
    /plan.*generation.*failed/i,
    /coverage.*analysis.*failed/i,
    /model.*rate.*limit/i,
    /token.*budget.*exceeded/i,
  ];

  if (safePatterns.some((p) => p.test(error.message))) {
    return error.message;
  }
  return "Plan generation failed. Please try again.";
}
