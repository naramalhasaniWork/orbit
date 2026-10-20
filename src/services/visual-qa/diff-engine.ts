import { createHash } from "crypto";
import { getStorage } from "@/lib/storage";
import { getModelForTask } from "@/lib/ai/model-router";
import { complete } from "@/server/ai/gateway";

// ============================================================
// Types
// ============================================================

export interface DiffRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  changeIntensity: number; // 0-1 how much this region changed
}

export interface DiffResult {
  diffPercentage: number; // 0-100% of pixels that changed
  regions: DiffRegion[];
  isRegression: boolean; // true if diffPercentage > threshold
  diffImageKey?: string; // Storage key for the diff overlay image
  summary: string; // Human-readable summary of changes
  identical: boolean; // Fast-path: checksums match exactly
}

interface CompareOptions {
  threshold?: number; // 0-100 percentage threshold for regression
  ignoreRegions?: DiffRegion[];
}

interface BillingContext {
  workspaceId: string;
  projectId?: string;
  runId?: string;
}

interface VisionDiffResponse {
  diffPercentage: number;
  regions: DiffRegion[];
  summary: string;
}

// ============================================================
// Checksum Helpers
// ============================================================

function computeChecksum(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

// ============================================================
// Claude Vision Diff Analysis
// ============================================================

async function analyzeWithVision(
  baselineData: Buffer,
  currentData: Buffer,
  ignoreRegions?: DiffRegion[],
  billing?: BillingContext
): Promise<VisionDiffResponse> {
  const model = await getModelForTask("visual_analysis");

  const baselineB64 = baselineData.toString("base64");
  const currentB64 = currentData.toString("base64");

  const ignoreInstruction = ignoreRegions?.length
    ? `\nIgnore changes in these regions: ${JSON.stringify(ignoreRegions)}`
    : "";

  const response = await complete({
    model,
    maxTokens: 2048,
    temperature: 0,
    system: `You are a visual QA analyst. Compare two screenshots and identify visual differences. Output ONLY valid JSON.`,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", mediaType: "image/png", data: baselineB64 },
          { type: "image", mediaType: "image/png", data: currentB64 },
          {
            type: "text",
            text: `Compare these two screenshots (first = baseline, second = current). Identify all visual differences.${ignoreInstruction}

Output JSON with this exact structure:
{
  "diffPercentage": <number 0-100>,
  "regions": [
    {
      "x": <approximate x pixel>,
      "y": <approximate y pixel>,
      "width": <approximate width>,
      "height": <approximate height>,
      "changeIntensity": <0-1 severity>
    }
  ],
  "summary": "<brief description of changes>"
}

If images are identical, return diffPercentage: 0 and empty regions array.
Focus on meaningful visual changes: layout shifts, color changes, text differences, missing/added elements. Ignore sub-pixel rendering differences.`,
          },
        ],
      },
    ],
  }, {
    workspaceId: billing?.workspaceId ?? "system",
    projectId: billing?.projectId,
    runId: billing?.runId,
    agentPhase: "executor",
  });

  const raw = response.content || "{}";

  const cleaned = raw
    .replace(/^```(?:json)?\s*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim();

  return JSON.parse(cleaned) as VisionDiffResponse;
}

// ============================================================
// Main Comparison Function
// ============================================================

export async function compareScreenshots(
  baselineKey: string,
  currentKey: string,
  options?: CompareOptions,
  billing?: BillingContext
): Promise<DiffResult> {
  const storage = getStorage();
  const threshold = options?.threshold ?? 5;

  // Load both images
  const [baselineData, currentData] = await Promise.all([
    storage.download(baselineKey),
    storage.download(currentKey),
  ]);

  // Fast identity check via checksum
  const baselineHash = computeChecksum(baselineData);
  const currentHash = computeChecksum(currentData);

  if (baselineHash === currentHash) {
    return {
      diffPercentage: 0,
      regions: [],
      isRegression: false,
      summary: "Screenshots are identical",
      identical: true,
    };
  }

  // Detailed diff via Claude Vision
  const visionResult = await analyzeWithVision(
    baselineData,
    currentData,
    options?.ignoreRegions,
    billing
  );

  return {
    diffPercentage: visionResult.diffPercentage,
    regions: visionResult.regions,
    isRegression: visionResult.diffPercentage > threshold,
    summary: visionResult.summary,
    identical: false,
  };
}
