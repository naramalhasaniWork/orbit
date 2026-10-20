import { describe, it, expect, vi, beforeEach } from "vitest";

const { store, publish, add, getJob, generatePlan, requestSuggestionRefresh } = vi.hoisted(() => ({
  store: new Map<string, string>(),
  publish: vi.fn(),
  add: vi.fn(),
  getJob: vi.fn(),
  generatePlan: vi.fn(),
  requestSuggestionRefresh: vi.fn(),
}));

const fakeRedis = {
  get: async (k: string) => store.get(k) ?? null,
  set: async (k: string, v: string, ...args: unknown[]) => {
    if (args.includes("NX") && store.has(k)) return null;
    store.set(k, v);
    return "OK";
  },
  del: async (k: string) => (store.delete(k) ? 1 : 0),
};

vi.mock("@/lib/redis", () => ({ getRedis: () => fakeRedis }));
vi.mock("@/lib/redis/pubsub", () => ({
  publish,
  channels: { planProgress: (id: string) => `plan:${id}:progress` },
}));
vi.mock("@/lib/queue/availability", () => ({
  requireQueueAvailable: async () => undefined,
  withQueueTimeout: <T>(op: Promise<T>) => op,
}));
vi.mock("@/lib/queue/queues", async (orig) => ({
  ...(await orig<typeof import("@/lib/queue/queues")>()),
  getPlanningQueue: () => ({ add, getJob }),
}));
vi.mock("@/services/planning/planner", () => ({ generatePlan }));
vi.mock("@/services/ai-suggestions/suggestion-cache", () => ({ requestSuggestionRefresh }));

import { enqueuePlanGeneration, readPlanJobState, isStale } from "@/services/planning/plan-jobs";
import { handlePlanningJob } from "@/lib/queue/planning-handler";
import type { Job } from "bullmq";
import type { PlanningJobData } from "@/lib/queue/queues";

const PROJECT = "11111111-1111-4111-8111-111111111111";

describe("plan generation jobs", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    add.mockResolvedValue({});
    getJob.mockResolvedValue(undefined);
    requestSuggestionRefresh.mockResolvedValue(true);
  });

  it("queues once and returns the in-flight job to a second request", async () => {
    const first = await enqueuePlanGeneration(PROJECT, { mode: "full" });
    const second = await enqueuePlanGeneration(PROJECT, { mode: "full" });

    expect(first.alreadyRunning).toBe(false);
    expect(first.state.status).toBe("queued");
    expect(second).toEqual({ state: first.state, alreadyRunning: true });
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      "generate-plan",
      { kind: "plan", projectId: PROJECT, mode: "full" },
      { jobId: first.state.jobId }
    );
  });

  it("does not leave a queued state behind when the enqueue fails", async () => {
    add.mockRejectedValueOnce(new Error("redis gone"));
    await expect(enqueuePlanGeneration(PROJECT, { mode: "full" })).rejects.toThrow();
    expect(await readPlanJobState(PROJECT)).toBeNull();
    await enqueuePlanGeneration(PROJECT, { mode: "full" });
    expect(add).toHaveBeenCalledTimes(2);
  });

  it("derives the job id from the inputs, not the clock", async () => {
    const a = await enqueuePlanGeneration(PROJECT, { mode: "full", focusAreas: ["b", "a"] });
    store.clear();
    const b = await enqueuePlanGeneration(PROJECT, { mode: "full", focusAreas: ["a", "b"] });
    store.clear();
    const c = await enqueuePlanGeneration(PROJECT, { mode: "smoke" });

    expect(a.state.jobId).toMatch(new RegExp(`^plan:${PROJECT}:[0-9a-f]{16}$`));
    expect(b.state.jobId).toBe(a.state.jobId);
    expect(c.state.jobId).not.toBe(a.state.jobId);
  });

  it("treats a job silent for 20 minutes as failed", () => {
    const old = new Date(Date.now() - 21 * 60 * 1000).toISOString();
    expect(isStale({ jobId: "j", status: "running", phase: "generating", message: "", progress: 50, updatedAt: old })).toBe(true);
    expect(isStale({ jobId: "j", status: "completed", phase: "complete", message: "", progress: 100, updatedAt: old })).toBe(false);
  });

  it("worker streams phases, records completion, and warms suggestions", async () => {
    generatePlan.mockImplementation(async (input: { onProgress: (p: unknown) => Promise<void> }) => {
      await input.onProgress({ phase: "generating", message: "Writing test cases", progress: 50 });
      return { plan: { id: "plan-1", version: 3 }, testCases: [{}, {}] };
    });

    await handlePlanningJob({
      id: "job-1",
      data: { kind: "plan", projectId: PROJECT, mode: "full" },
    } as Job<PlanningJobData>);

    const types = publish.mock.calls.map(([, e]) => (e as { type: string }).type);
    expect(types).toEqual(["plan:progress", "plan:progress", "plan:completed"]);
    expect(await readPlanJobState(PROJECT)).toMatchObject({
      status: "completed",
      planId: "plan-1",
      version: 3,
      testCaseCount: 2,
    });
    expect(requestSuggestionRefresh).toHaveBeenCalledWith(PROJECT);
  });

  it("worker records a sanitized failure and rethrows", async () => {
    generatePlan.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.3:5432"));

    await expect(
      handlePlanningJob({ id: "job-2", data: { kind: "plan", projectId: PROJECT, mode: "full" } } as Job<PlanningJobData>)
    ).rejects.toThrow();

    expect(await readPlanJobState(PROJECT)).toMatchObject({
      status: "failed",
      error: "Plan generation failed. Please try again.",
    });
    expect(requestSuggestionRefresh).not.toHaveBeenCalled();
  });
});
