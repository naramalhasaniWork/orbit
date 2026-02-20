import { publish, channels } from "@/lib/redis/pubsub";
import type {
  RunStartedEvent,
  RunProgressEvent,
  RunCompletedEvent,
  TestCompletedEvent,
  IndexingProgressEvent,
} from "@/lib/websocket/channels";

const isDev = process.env.NODE_ENV === "development";

export async function emitRunStarted(
  runId: string,
  data: RunStartedEvent
): Promise<void> {
  if (isDev) {
    console.log(`[WS:run:started:${runId}]`, data);
  }

  try {
    await publish(channels.runProgress(runId), {
      type: "run:started",
      payload: data,
    });
  } catch (err) {
    console.error(`[WS] Failed to emit run started for ${runId}:`, err);
  }
}

export async function emitRunProgress(
  runId: string,
  data: RunProgressEvent
): Promise<void> {
  if (isDev) {
    console.log(`[WS:run:${runId}]`, data);
  }

  try {
    await publish(channels.runProgress(runId), {
      type: "run:progress",
      payload: data,
    });
  } catch (err) {
    console.error(`[WS] Failed to emit run progress for ${runId}:`, err);
  }
}

export async function emitRunCompleted(
  runId: string,
  data: RunCompletedEvent
): Promise<void> {
  if (isDev) {
    console.log(`[WS:run:completed:${runId}]`, data);
  }

  try {
    await publish(channels.runProgress(runId), {
      type: "run:completed",
      payload: data,
    });
  } catch (err) {
    console.error(`[WS] Failed to emit run completed for ${runId}:`, err);
  }
}

export async function emitTestCompleted(
  runId: string,
  data: TestCompletedEvent
): Promise<void> {
  if (isDev) {
    console.log(`[WS:test:completed:${runId}]`, data);
  }

  try {
    await publish(channels.runProgress(runId), {
      type: "test:completed",
      payload: data,
    });
  } catch (err) {
    console.error(`[WS] Failed to emit test completed for ${runId}:`, err);
  }
}

export async function emitIndexingProgress(
  projectId: string,
  data: IndexingProgressEvent
): Promise<void> {
  if (isDev) {
    console.log(`[WS:index:${projectId}]`, data);
  }

  try {
    await publish(channels.indexingProgress(projectId), {
      type: "indexing:progress",
      payload: data,
    });
  } catch (err) {
    console.error(`[WS] Failed to emit indexing progress for ${projectId}:`, err);
  }
}
