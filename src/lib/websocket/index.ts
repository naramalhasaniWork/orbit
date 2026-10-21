import { publish, channels } from "@/lib/redis/pubsub";
import type {
  RunStartedEvent,
  RunProgressEvent,
  RunCompletedEvent,
  TestStartedEvent,
  TestStepEvent,
  TestCompletedEvent,
  TestScreenshotEvent,
  IndexingStartedEvent,
  IndexingPhaseEvent,
  IndexingNodeDiscoveredEvent,
  IndexingEdgeDiscoveredEvent,
  IndexingProgressEvent,
  IndexingCompletedEvent,
  IndexingFailedEvent,
} from "@/lib/websocket/channels";

const isDev = process.env.NODE_ENV === "development";

function log(label: string, data: unknown) {
  if (isDev) console.log(`[RT:${label}]`, data);
}

// --- Run events ---

export async function emitRunStarted(
  runId: string,
  data: RunStartedEvent
): Promise<void> {
  log(`run:started:${runId}`, data);
  const event = { type: "run:started", payload: data };
  await safePublish(channels.runProgress(runId), event);
  // Fan-out to project channel for dashboard updates
  if (data.projectId) {
    await safePublish(channels.projectEvents(data.projectId), event);
  }
}

export async function emitRunProgress(
  runId: string,
  data: RunProgressEvent
): Promise<void> {
  log(`run:progress:${runId}`, data);
  await safePublish(channels.runProgress(runId), { type: "run:progress", payload: data });
  // Some terminal paths (cancel, empty run) report only a progress status.
  if (TERMINAL_RUN_STATUSES.has(data.status)) {
    await closeScreenshotStream(runId, data.status as RunCompletedEvent["status"]);
  }
}

export async function emitRunCompleted(
  runId: string,
  data: RunCompletedEvent
): Promise<void> {
  log(`run:completed:${runId}`, data);
  const event = { type: "run:completed", payload: data };
  await safePublish(channels.runProgress(runId), event);
  // Fan-out to project channel for dashboard updates
  if (data.projectId) {
    await safePublish(channels.projectEvents(data.projectId), event);
  }
  await closeScreenshotStream(runId, data.status);
}

// --- Test events ---

export async function emitTestStarted(
  runId: string,
  data: TestStartedEvent
): Promise<void> {
  log(`test:started:${runId}`, data);
  await safePublish(channels.runProgress(runId), { type: "test:started", payload: data });
}

export async function emitTestStep(
  runId: string,
  data: TestStepEvent
): Promise<void> {
  log(`test:step:${runId}`, data);
  await safePublish(channels.runProgress(runId), { type: "test:step", payload: data });
}

export async function emitTestCompleted(
  runId: string,
  data: TestCompletedEvent
): Promise<void> {
  log(`test:completed:${runId}`, data);
  const event = { type: "test:completed", payload: data };
  await safePublish(channels.runProgress(runId), event);
}

export async function emitTestScreenshot(
  runId: string,
  data: TestScreenshotEvent
): Promise<void> {
  log(`test:screenshot:${runId}`, data);
  await safePublish(channels.runProgress(runId), { type: "test:screenshot", payload: data });
}

// --- Indexing events ---

export async function emitIndexingStarted(
  projectId: string,
  data: IndexingStartedEvent
): Promise<void> {
  log(`indexing:started:${projectId}`, data);
  await safePublish(channels.indexingProgress(projectId), {
    type: "indexing:started",
    payload: data,
  });
}

export async function emitIndexingPhase(
  projectId: string,
  data: IndexingPhaseEvent
): Promise<void> {
  log(`indexing:phase:${projectId}`, data);
  await safePublish(channels.indexingProgress(projectId), {
    type: "indexing:phase",
    payload: data,
  });
}

export async function emitIndexingNodeDiscovered(
  projectId: string,
  data: IndexingNodeDiscoveredEvent
): Promise<void> {
  log(`indexing:node:${projectId}`, data);
  await safePublish(channels.indexingProgress(projectId), {
    type: "indexing:node_discovered",
    payload: data,
  });
}

export async function emitIndexingEdgeDiscovered(
  projectId: string,
  data: IndexingEdgeDiscoveredEvent
): Promise<void> {
  log(`indexing:edge:${projectId}`, data);
  await safePublish(channels.indexingProgress(projectId), {
    type: "indexing:edge_discovered",
    payload: data,
  });
}

export async function emitIndexingProgress(
  projectId: string,
  data: IndexingProgressEvent
): Promise<void> {
  log(`indexing:progress:${projectId}`, data);
  await safePublish(channels.indexingProgress(projectId), {
    type: "indexing:progress",
    payload: data,
  });
}

export async function emitIndexingCompleted(
  projectId: string,
  data: IndexingCompletedEvent
): Promise<void> {
  log(`indexing:completed:${projectId}`, data);
  await safePublish(channels.indexingProgress(projectId), {
    type: "indexing:completed",
    payload: data,
  });
}

export async function emitIndexingFailed(
  projectId: string,
  data: IndexingFailedEvent
): Promise<void> {
  log(`indexing:failed:${projectId}`, data);
  await safePublish(channels.indexingProgress(projectId), {
    type: "indexing:failed",
    payload: data,
  });
}

// --- Helper ---

const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "cancelled"]);

/** Tells the live-frame stream the run is over, so its viewer finishes instead of waiting for the stream cap. */
async function closeScreenshotStream(runId: string, status: RunCompletedEvent["status"]): Promise<void> {
  await safePublish(channels.runScreenshots(runId), {
    type: "run:completed",
    payload: { runId, status },
  });
}

async function safePublish(channel: string, data: unknown): Promise<void> {
  try {
    await publish(channel, data);
  } catch (err) {
    console.error(`[RT] Failed to publish to ${channel}:`, err);
  }
}
