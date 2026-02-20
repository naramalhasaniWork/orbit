import type {
  Page,
  BrowserContext,
  Request as PlaywrightRequest,
  Response as PlaywrightResponse,
} from "playwright";
import { getStorage } from "@/lib/storage";

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
  captureScreenshot(label: string): Promise<string>;
  captureDomSnapshot(): Promise<string>;
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
  context?: BrowserContext
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

  async function captureScreenshot(label: string): Promise<string> {
    const storage = getStorage();
    const timestamp = Date.now();
    const key = `runs/${runId}/${testCaseId}/${label}-${timestamp}.png`;

    const buffer = await page.screenshot({ fullPage: true });
    await storage.upload(key, buffer, "image/png");

    const url = await storage.getUrl(key);
    evidence.screenshots.push(url);
    return url;
  }

  async function captureDomSnapshot(): Promise<string> {
    const storage = getStorage();
    const key = `runs/${runId}/${testCaseId}/dom-snapshot-${Date.now()}.html`;

    const html = await page.content();
    await storage.upload(key, Buffer.from(html), "text/html");

    const url = await storage.getUrl(key);
    evidence.domSnapshot = url;
    return url;
  }

  async function finalizeVideo(): Promise<string | undefined> {
    if (!context) return undefined;

    try {
      // Close the page to finalize video recording
      const video = page.video();
      if (!video) return undefined;

      const videoPath = await video.path();
      if (!videoPath) return undefined;

      const { readFile } = await import("fs/promises");
      const videoBuffer = await readFile(videoPath);

      const storage = getStorage();
      const key = `runs/${runId}/${testCaseId}/video-${Date.now()}.webm`;
      await storage.upload(key, videoBuffer, "video/webm");

      const url = await storage.getUrl(key);
      evidence.videoUrl = url;
      return url;
    } catch {
      // Video recording may not be available (e.g., remote browsers)
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
  entries: NetworkEntry[]
): Promise<string> {
  const storage = getStorage();
  const key = `runs/${runId}/${testCaseId}/network-log.json`;
  const data = Buffer.from(JSON.stringify(entries, null, 2));
  await storage.upload(key, data, "application/json");
  return storage.getUrl(key);
}

export async function saveConsoleLog(
  runId: string,
  testCaseId: string,
  entries: ConsoleEntry[]
): Promise<string> {
  const storage = getStorage();
  const key = `runs/${runId}/${testCaseId}/console-log.json`;
  const data = Buffer.from(JSON.stringify(entries, null, 2));
  await storage.upload(key, data, "application/json");
  return storage.getUrl(key);
}
