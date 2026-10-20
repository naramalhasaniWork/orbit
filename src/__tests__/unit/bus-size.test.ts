import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Page } from "playwright";
import { assertBusMessagesWithinLimit, fakeRedis as redis } from "../helpers/fake-redis";

vi.mock("@/lib/redis", async () => (await import("../helpers/fake-redis")).redisMock());
vi.mock("@/lib/db", () => ({ prisma: { runArtifact: { create: vi.fn(async () => ({ id: "artifact-1" })) } } }));
vi.mock("@/lib/storage", () => ({ getStorage: () => ({ upload: vi.fn(async () => undefined) }) }));

import { channels, publish } from "@/lib/redis/pubsub";
import { captureAndStream } from "@/services/execution/screenshot-streamer";
import { frameRedisKey } from "@/server/realtime/frames";
import { DEFAULT_SSE_EVENT_TYPES } from "@/lib/sse/reconnecting-source";
import type { WebSocketEvent } from "@/lib/websocket/channels";

const ID = "0d9a8a3e-5b1f-4a8e-9a53-0f3c3b2b6a11";
const long = (n: number) => "x".repeat(n);
const URL_512 = `https://staging.example.com/${long(480)}`;

/** One worst-plausible payload per event type; the mapped type forces a fixture when a type is added. */
const FIXTURES: { [T in Exclude<WebSocketEvent["type"], "heartbeat">]: Extract<WebSocketEvent, { type: T }>["payload"] } = {
  "indexing:started": { projectId: ID, branch: long(200), isIncremental: true },
  "indexing:phase": { projectId: ID, phase: "embeddings", message: long(400), progress: 0.5 },
  "indexing:node_discovered": { projectId: ID, nodeId: ID, nodeType: "component", nodeName: long(200), filePath: long(300) },
  "indexing:progress": { projectId: ID, phase: "ast", message: long(400), nodesFound: 99999, progress: 1 },
  "indexing:completed": { projectId: ID, nodesFound: 99999, edgesFound: 99999, durationMs: 99999999 },
  "indexing:failed": { projectId: ID, error: long(5000), phase: "ast" },
  "run:started": { runId: ID, projectId: ID, mode: "parallel", trigger: "schedule", totalTests: 9999 },
  "run:progress": { runId: ID, status: "executing", currentTest: long(300), totalTests: 9999, passed: 9999, failed: 9999, flaky: 9999 },
  "run:completed": { runId: ID, projectId: ID, status: "completed", totalTests: 9999, passed: 9999, failed: 9999, flaky: 9999, durationMs: 99999999 },
  "test:started": { runId: ID, testCaseId: ID, testCaseName: long(300) },
  "test:step": { runId: ID, testCaseId: ID, stepIndex: 999, action: long(3000), status: "failed", screenshotUrl: URL_512 },
  "test:completed": { runId: ID, testCaseId: ID, testCaseName: long(300), verdict: "environment_error", durationMs: 99999999 },
  "test:screenshot": { runId: ID, testCaseId: ID, stepIndex: 999, screenshotUrl: URL_512, timestamp: 1700000000000 },
  "test:result": { runId: ID, testCaseId: ID, verdict: "environment_error", durationMs: 99999999 },
  "screenshot:frame": {
    runId: ID, testCaseId: ID, stepIndex: 999, timestamp: 1700000000000, frameKey: ID, pageUrl: URL_512,
    viewport: { width: 1280, height: 720 },
  },
  "plan:progress": { jobId: `plan:${ID}:${long(64)}`, status: "running", phase: "generating", message: long(400), progress: 1, updatedAt: new Date().toISOString() },
  "plan:completed": { jobId: `plan:${ID}:${long(64)}`, status: "completed", phase: "done", message: long(400), progress: 1, planId: ID, version: 99, testCaseCount: 999, updatedAt: new Date().toISOString() },
  "plan:failed": { jobId: `plan:${ID}:${long(64)}`, status: "failed", phase: "generating", message: long(400), progress: 1, error: long(5000), updatedAt: new Date().toISOString() },
};

describe("bus message size", () => {
  beforeEach(() => {
    redis.streams.clear();
    redis.published = [];
    redis.buffers.clear();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("keeps every published event type within 4KB", async () => {
    for (const [type, payload] of Object.entries(FIXTURES)) {
      expect(await publish(channels.runProgress(ID), { type, payload })).not.toBeNull();
    }
    expect(redis.published).toHaveLength(Object.keys(FIXTURES).length);
    assertBusMessagesWithinLimit(redis);
  });

  it("covers every event type the client subscribes to", () => {
    // Written by the SSE layer or a route for an already-finished run, never published on the bus.
    const wireOnly = new Set(["connected", "heartbeat", "timeout", "error", "replay_gap", "screenshots:complete"]);
    const clientTypes = DEFAULT_SSE_EVENT_TYPES.filter((t) => !wireOnly.has(t));
    expect(Object.keys(FIXTURES).sort()).toEqual([...clientTypes].sort());
  });

  it("clips an oversized error instead of dropping the terminal event", async () => {
    await publish(channels.indexingProgress(ID), { type: "indexing:failed", payload: { ...FIXTURES["indexing:failed"], error: long(50_000) } });
    assertBusMessagesWithinLimit(redis);
    const [{ message }] = redis.published;
    expect(JSON.parse(message).event.payload.error.length).toBeLessThan(600);
  });

  it("drops, loudly, an event that cannot fit", async () => {
    const huge = { type: "test:step", payload: { rows: Array.from({ length: 2000 }, (_, i) => i) } };
    expect(await publish(channels.runProgress(ID), huge)).toBeNull();
    expect(redis.published).toHaveLength(0);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Dropped test:step"));
  });

  it("puts a screenshot in a Redis key and only a pointer on the bus", async () => {
    const jpeg = Buffer.alloc(200_000, 1);
    const page = {
      viewportSize: () => ({ width: 1280, height: 720 }),
      screenshot: async () => jpeg,
      url: () => URL_512,
    } as unknown as Page;

    await captureAndStream(page, ID, ID, 3, ID);

    assertBusMessagesWithinLimit(redis);
    const frames = redis.published.map((p) => JSON.parse(p.message).event).filter((e) => e.type === "screenshot:frame");
    expect(frames).toHaveLength(1);
    const { frameKey, stepIndex } = frames[0].payload;
    expect(stepIndex).toBe(3);
    expect(frames[0].payload).not.toHaveProperty("imageBase64");
    expect(redis.buffers.get(frameRedisKey(ID, frameKey))).toEqual(jpeg);
    expect(redis.ttls.get(frameRedisKey(ID, frameKey))).toBe(30 * 60);
  });
});
