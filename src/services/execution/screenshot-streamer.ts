import type { Page } from "playwright";
import { publish } from "@/lib/redis/pubsub";
import { getRedis } from "@/lib/redis";
import { getStorage } from "@/lib/storage";
import { prisma } from "@/lib/db";

// ============================================================
// Types
// ============================================================

export interface ScreenshotFrame {
  runId: string;
  testCaseId: string;
  stepIndex: number;
  timestamp: number;
  imageBase64: string;
  pageUrl: string;
  viewport: { width: number; height: number };
}

interface CaptureOptions {
  page: Page;
  runId: string;
  testCaseId: string;
  stepIndex: number;
  projectId?: string;
  label?: string;
}

// ============================================================
// Channel + Key Helpers
// ============================================================

export function screenshotChannel(runId: string): string {
  return `run:${runId}:screenshots`;
}

/** Redis key for the latest screenshot frame (buffered for late-joining clients). */
export function latestScreenshotKey(runId: string): string {
  return `run:${runId}:latest-screenshot`;
}

/** TTL for the buffered latest screenshot (5 minutes). */
const LATEST_SCREENSHOT_TTL_SECONDS = 300;

// ============================================================
// Screenshot Capture + Stream
// ============================================================

const MAX_WIDTH = 1280;
const JPEG_QUALITY = 60;

/**
 * Captures a JPEG screenshot from the Playwright page,
 * publishes it to Redis pub/sub for live streaming,
 * buffers the latest frame in Redis for late-joining clients,
 * and persists it as a RunArtifact for later gallery viewing.
 *
 * Returns the storage key of the persisted screenshot, or null on failure.
 */
export async function captureAndStream(
  page: Page,
  runId: string,
  testCaseId: string,
  stepIndex: number,
  projectId?: string,
  label?: string
): Promise<string | null> {
  return captureScreenshotFrame({
    page,
    runId,
    testCaseId,
    stepIndex,
    projectId,
    label,
  });
}

async function captureScreenshotFrame(options: CaptureOptions): Promise<string | null> {
  const { page, runId, testCaseId, stepIndex, projectId, label } = options;

  try {
    const viewportSize = page.viewportSize() ?? { width: 1280, height: 720 };

    // Scale down if wider than MAX_WIDTH
    const scale = viewportSize.width > MAX_WIDTH
      ? MAX_WIDTH / viewportSize.width
      : 1;

    if (scale < 1) {
      await page.setViewportSize({
        width: MAX_WIDTH,
        height: Math.round(viewportSize.height * scale),
      });
    }

    const buffer = await page.screenshot({
      type: "jpeg",
      quality: JPEG_QUALITY,
      fullPage: false,
    });

    // Restore original viewport if scaled
    if (scale < 1) {
      await page.setViewportSize(viewportSize);
    }

    const imageBase64 = buffer.toString("base64");
    const pageUrl = page.url();
    const timestamp = Date.now();

    const frame: ScreenshotFrame = {
      runId,
      testCaseId,
      stepIndex,
      timestamp,
      imageBase64,
      pageUrl,
      viewport: viewportSize,
    };

    // Publish to Redis for live streaming + buffer for late-joining clients
    await publishFrame(runId, frame);

    // Persist to storage for gallery
    const storageKey = await persistScreenshot(
      buffer, runId, testCaseId, stepIndex, timestamp, projectId, label
    );

    return storageKey;
  } catch (err) {
    console.error(
      `[ScreenshotStreamer] Failed to capture screenshot for run=${runId} step=${stepIndex}:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

// ============================================================
// Redis Publishing
// ============================================================

async function publishFrame(
  runId: string,
  frame: ScreenshotFrame
): Promise<void> {
  const channel = screenshotChannel(runId);
  const event = { type: "screenshot:frame", payload: frame };

  try {
    // Publish to pub/sub for actively connected clients
    await publish(channel, event);

    // Buffer the latest frame in a Redis key for late-joining clients.
    // This ensures clients that connect after the first screenshots are
    // published still get the current frame immediately.
    const redis = getRedis();
    await redis.set(
      latestScreenshotKey(runId),
      JSON.stringify(event),
      "EX",
      LATEST_SCREENSHOT_TTL_SECONDS
    );
  } catch (err) {
    console.error(
      `[ScreenshotStreamer] Failed to publish frame for run=${runId}:`,
      err instanceof Error ? err.message : err
    );
  }
}

// ============================================================
// Persistent Storage
// ============================================================

async function persistScreenshot(
  buffer: Buffer,
  runId: string,
  testCaseId: string,
  stepIndex: number,
  timestamp: number,
  projectId?: string,
  label?: string
): Promise<string | null> {
  const storage = getStorage();
  const fileName = `${label ?? "step"}-${stepIndex}-${timestamp}.jpg`;
  const key = `runs/${runId}/${testCaseId}/${fileName}`;

  try {
    await storage.upload(key, buffer, "image/jpeg");

    if (projectId) {
      await prisma.runArtifact.create({
        data: {
          projectId,
          testRunId: runId,
          type: "screenshot",
          storageKey: key,
          fileName,
          contentType: "image/jpeg",
          sizeBytes: buffer.length,
          stepIndex,
        },
      });
    }

    return key;
  } catch (err) {
    console.error(
      `[ScreenshotStreamer] Failed to persist screenshot:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

// ============================================================
// Convenience: Capture initial state before first step
// ============================================================

export async function captureInitialState(
  page: Page,
  runId: string,
  testCaseId: string,
  projectId?: string
): Promise<void> {
  await captureAndStream(page, runId, testCaseId, -1, projectId, "initial");
}

// ============================================================
// Convenience: Capture failure screenshot
// ============================================================

export async function captureFailureState(
  page: Page,
  runId: string,
  testCaseId: string,
  stepIndex: number,
  projectId?: string
): Promise<void> {
  await captureAndStream(page, runId, testCaseId, stepIndex, projectId, "failure");
}
