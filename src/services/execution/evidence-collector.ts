import type {
  Page,
  BrowserContext,
  Request as PlaywrightRequest,
  Response as PlaywrightResponse,
} from "playwright";
import { getStorage } from "@/lib/storage";
import { absoluteArtifactFileUrl } from "@/lib/storage/artifact-url";
import { prisma } from "@/lib/db";

// ============================================================
// Types
// ============================================================

interface NetworkEntry {
  url: string;
  method: string;
  status: number | null;
  duration: number;
  resourceType: string;
}

interface ConsoleEntry {
  type: string;
  text: string;
  timestamp: number;
}

export interface Evidence {
  screenshots: string[];
  videoUrl?: string;
  networkLog: NetworkEntry[];
  consoleLog: ConsoleEntry[];
  domSnapshot?: string;
}

export interface EvidenceCollectorInstance {
  evidence: Evidence;
  startCapture(): void;
  stopCapture(): void;
  captureScreenshot(label: string, stepIndex?: number): Promise<string>;
  captureDomSnapshot(stepIndex?: number): Promise<string>;
  finalizeVideo(): Promise<string | undefined>;
  getEvidence(): Evidence;
}

// ============================================================
// Evidence Collector
// ============================================================

export function createEvidenceCollector(
  page: Page,
  runId: string,
  testCaseId: string,
  context?: BrowserContext,
  projectId?: string
): EvidenceCollectorInstance {
  const evidence: Evidence = {
    screenshots: [],
    networkLog: [],
    consoleLog: [],
  };

  const requestTimings = new Map<string, number>();

  const onRequest = (request: PlaywrightRequest) => {
    requestTimings.set(request.url(), Date.now());
  };

  const onResponse = (response: PlaywrightResponse) => {
    const url = response.url();
    const startTime = requestTimings.get(url);
    const duration = startTime ? Date.now() - startTime : 0;
    requestTimings.delete(url);

    evidence.networkLog.push({
      url,
      method: response.request().method(),
      status: response.status(),
      duration,
      resourceType: response.request().resourceType(),
    });
  };

  const onConsole = (msg: { type: () => string; text: () => string }) => {
    evidence.consoleLog.push({
      type: msg.type(),
      text: msg.text(),
      timestamp: Date.now(),
    });
  };

  function startCapture(): void {
    page.on("request", onRequest);
    page.on("response", onResponse);
    page.on("console", onConsole);
  }

  function stopCapture(): void {
    page.removeListener("request", onRequest);
    page.removeListener("response", onResponse);
    page.removeListener("console", onConsole);
  }

  async function captureScreenshot(label: string, stepIndex?: number): Promise<string> {
    const storage = getStorage();
    const timestamp = Date.now();
    const fileName = `${label}-${timestamp}.png`;
    const key = `runs/${runId}/${testCaseId}/${fileName}`;

    const buffer = await page.screenshot({ fullPage: true });
    await storage.upload(key, buffer, "image/png");

    let url = key;
    if (projectId) {
      const artifact = await prisma.runArtifact.create({
        data: {
          projectId, testRunId: runId, type: "screenshot", storageKey: key,
          fileName, contentType: "image/png", sizeBytes: buffer.length, stepIndex,
        },
        select: { id: true },
      });
      url = absoluteArtifactFileUrl(projectId, runId, artifact.id);
    }

    evidence.screenshots.push(url);
    return url;
  }

  async function captureDomSnapshot(stepIndex?: number): Promise<string> {
    const storage = getStorage();
    const fileName = `dom-snapshot-${Date.now()}.html`;
    const key = `runs/${runId}/${testCaseId}/${fileName}`;

    const html = await page.content();
    const buffer = Buffer.from(html);
    await storage.upload(key, buffer, "text/html");

    let url = key;
    if (projectId) {
      const artifact = await prisma.runArtifact.create({
        data: {
          projectId, testRunId: runId, type: "dom_snapshot", storageKey: key,
          fileName, contentType: "text/html", sizeBytes: buffer.length, stepIndex,
        },
        select: { id: true },
      });
      url = absoluteArtifactFileUrl(projectId, runId, artifact.id);
    }

    evidence.domSnapshot = url;
    return url;
  }

  async function finalizeVideo(): Promise<string | undefined> {
    if (!context) return undefined;

    try {
      const video = page.video();
      if (!video) return undefined;

      const videoPath = await video.path();
      if (!videoPath) return undefined;

      const { readFile } = await import("fs/promises");
      const videoBuffer = await readFile(videoPath);

      const storage = getStorage();
      const fileName = `video-${Date.now()}.webm`;
      const key = `runs/${runId}/${testCaseId}/${fileName}`;
      await storage.upload(key, videoBuffer, "video/webm");

      let url = key;
      if (projectId) {
        const artifact = await prisma.runArtifact.create({
          data: {
            projectId, testRunId: runId, type: "video", storageKey: key,
            fileName, contentType: "video/webm", sizeBytes: videoBuffer.length,
          },
          select: { id: true },
        });
        url = absoluteArtifactFileUrl(projectId, runId, artifact.id);
      }

      evidence.videoUrl = url;
      return url;
    } catch {
      return undefined;
    }
  }

  function getEvidence(): Evidence {
    return { ...evidence };
  }

  return {
    evidence,
    startCapture,
    stopCapture,
    captureScreenshot,
    captureDomSnapshot,
    finalizeVideo,
    getEvidence,
  };
}

// ============================================================
// Artifact Storage Helpers
// ============================================================

export async function saveArtifact(
  runId: string,
  testCaseId: string,
  name: string,
  data: Buffer,
  contentType: string
): Promise<string> {
  const storage = getStorage();
  const key = `runs/${runId}/${testCaseId}/${name}`;
  await storage.upload(key, data, contentType);
  return storage.getUrl(key);
}

export async function saveNetworkLog(
  runId: string,
  testCaseId: string,
  entries: NetworkEntry[],
  projectId?: string
): Promise<string> {
  const storage = getStorage();
  const key = `runs/${runId}/${testCaseId}/network-log.json`;
  const data = Buffer.from(JSON.stringify(entries, null, 2));
  await storage.upload(key, data, "application/json");

  if (projectId) {
    const artifact = await prisma.runArtifact.create({
      data: {
        projectId, testRunId: runId, type: "network_log", storageKey: key,
        fileName: "network-log.json", contentType: "application/json", sizeBytes: data.length,
      },
      select: { id: true },
    });
    return absoluteArtifactFileUrl(projectId, runId, artifact.id);
  }

  return key;
}

export async function saveConsoleLog(
  runId: string,
  testCaseId: string,
  entries: ConsoleEntry[],
  projectId?: string
): Promise<string> {
  const storage = getStorage();
  const key = `runs/${runId}/${testCaseId}/console-log.json`;
  const data = Buffer.from(JSON.stringify(entries, null, 2));
  await storage.upload(key, data, "application/json");

  if (projectId) {
    const artifact = await prisma.runArtifact.create({
      data: {
        projectId, testRunId: runId, type: "console_log", storageKey: key,
        fileName: "console-log.json", contentType: "application/json", sizeBytes: data.length,
      },
      select: { id: true },
    });
    return absoluteArtifactFileUrl(projectId, runId, artifact.id);
  }

  return key;
}
