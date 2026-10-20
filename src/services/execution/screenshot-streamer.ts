import { randomUUID } from "node:crypto";
import type { Page } from "playwright";
import { publish } from "@/lib/redis/pubsub";
import { getRedis } from "@/lib/redis";
import { getStorage } from "@/lib/storage";
import { artifactFileUrl } from "@/lib/storage/artifact-url";
import { prisma } from "@/lib/db";
import type { ScreenshotFrameEvent } from "@/lib/websocket/channels";
import { frameRedisKey, FRAME_TTL_SECONDS } from "@/server/realtime/frames";

// ============================================================
// Types
// ============================================================

interface CaptureOptions {
  page: Page;
  runId: string;
  testCaseId: string;
  stepIndex: number;
  projectId?: string;
  label?: string;
}

export interface ScreenshotCaptureResult {
  storageKey: string;
  /** Browser-loadable URL — null when no RunArtifact row was created */
  url: string | null;
}

// ============================================================
// Channel + Key Helpers
// ============================================================

export function screenshotChannel(runId: string): string {
  return `run:${runId}:screenshots`;
}

// ============================================================
// Screenshot Capture + Stream
// ============================================================

const MAX_WIDTH = 1280;
const MAX_PAGE_URL_CHARS = 512;
const JPEG_QUALITY = 60;

/**
 * Captures a JPEG screenshot from the Playwright page,
 * parks the image in a short-lived Redis key and publishes only a pointer to
 * it (the bus carries at most 4KB per message), and persists it as a
 * RunArtifact for later gallery viewing.
 *
 * Returns the persisted screenshot's storage key and browser-facing URL,
 * or null on failure.
 */
export async function captureAndStream(
  page: Page,
  runId: string,
  testCaseId: string,
  stepIndex: number,
  projectId?: string,
  label?: string
): Promise<ScreenshotCaptureResult | null> {
  return captureScreenshotFrame({
    page,
    runId,
    testCaseId,
    stepIndex,
    projectId,
    label,
  });
}

async function captureScreenshotFrame(
  options: CaptureOptions
): Promise<ScreenshotCaptureResult | null> {
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

    const timestamp = Date.now();

    await publishFrame(buffer, {
      runId,
      testCaseId,
      stepIndex,
      timestamp,
      pageUrl: page.url().slice(0, MAX_PAGE_URL_CHARS),
      viewport: viewportSize,
    });

    // Persist to storage for gallery
    return persistScreenshot(
      buffer, runId, testCaseId, stepIndex, timestamp, projectId, label
    );
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
  jpeg: Buffer,
  frame: Omit<ScreenshotFrameEvent, "frameKey">
): Promise<void> {
  const frameKey = randomUUID();
  try {
    // The image must be fetchable before any client hears about it.
    await getRedis().set(frameRedisKey(frame.runId, frameKey), jpeg, "EX", FRAME_TTL_SECONDS);
    await publish(screenshotChannel(frame.runId), {
      type: "screenshot:frame",
      payload: { ...frame, frameKey },
    });
  } catch (err) {
    console.error(
      `[ScreenshotStreamer] Failed to publish frame for run=${frame.runId}:`,
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
): Promise<ScreenshotCaptureResult | null> {
  const storage = getStorage();
  const fileName = `${label ?? "step"}-${stepIndex}-${timestamp}.jpg`;
  const key = `runs/${runId}/${testCaseId}/${fileName}`;

  try {
    await storage.upload(key, buffer, "image/jpeg");

    let url: string | null = null;
    if (projectId) {
      const artifact = await prisma.runArtifact.create({
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
        select: { id: true },
      });
      url = artifactFileUrl(projectId, runId, artifact.id);
    }

    return { storageKey: key, url };
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
