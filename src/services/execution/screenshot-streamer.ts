import type { Page } from "playwright";
import { publish } from "@/lib/redis/pubsub";
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
// Channel Helper
// ============================================================

export function screenshotChannel(runId: string): string {
  return `run:${runId}:screenshots`;
}

// ============================================================
// Screenshot Capture + Stream
// ============================================================

const MAX_WIDTH = 1280;
const JPEG_QUALITY = 60;

/**
 * Captures a JPEG screenshot from the Playwright page,
 * publishes it to Redis pub/sub for live streaming,
 * and persists it as a RunArtifact for later gallery viewing.
 */
export async function captureAndStream(
  page: Page,
  runId: string,
  testCaseId: string,
  stepIndex: number,
  projectId?: string,
  label?: string
): Promise<void> {
  await captureScreenshotFrame({
    page,
    runId,
    testCaseId,
    stepIndex,
    projectId,
    label,
  });
}

async function captureScreenshotFrame(options: CaptureOptions): Promise<void> {
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

    // Publish to Redis for live streaming
    await publishFrame(runId, frame);

    // Persist to storage for gallery
    await persistScreenshot(
      buffer, runId, testCaseId, stepIndex, timestamp, projectId, label
    );
  } catch (err) {
    console.error(
      `[ScreenshotStreamer] Failed to capture screenshot for run=${runId} step=${stepIndex}:`,
      err instanceof Error ? err.message : err
    );
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
    await publish(channel, event);
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
): Promise<void> {
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
  } catch (err) {
    console.error(
      `[ScreenshotStreamer] Failed to persist screenshot:`,
      err instanceof Error ? err.message : err
    );
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
