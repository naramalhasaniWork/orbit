import { launchBrowser, closeBrowser, type StorageState } from "@/services/execution/browser-manager";
import { installAccessHeaders, type AccessHeaders } from "@/services/execution/access-headers";
import { getStorage } from "@/lib/storage";
import { compareScreenshots, type DiffResult } from "@/services/visual-qa/diff-engine";
import { checkBrandConsistency, type BrandCheckResult } from "@/services/visual-qa/brand-checker";
import { getBaseline, acceptAsBaseline, computeChecksum } from "@/services/visual-qa/baseline-manager";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

// ============================================================
// Types
// ============================================================

export interface VisualTestInput {
  runId: string;
  projectId: string;
  routePath: string;
  environmentUrl: string;
  checkBrand?: boolean;
  diffThreshold?: number;
  /** Logged-in session from the run, so authenticated routes aren't captured as the login page */
  storageState?: StorageState;
  /** Cloudflare Access service-token headers, sent only to the environment's origin */
  accessHeaders?: AccessHeaders;
}

export interface VisualTestResult {
  passed: boolean;
  isBaselineCapture: boolean;
  screenshotKey: string;
  diff?: DiffResult;
  brandCheck?: BrandCheckResult;
  baselineKey?: string;
  durationMs: number;
}

interface BillingInfo {
  workspaceId: string;
  projectId: string;
  runId: string;
}

// ============================================================
// Screenshot Capture
// ============================================================

async function captureScreenshot(
  url: string,
  routePath: string,
  storageState?: StorageState,
  accessHeaders?: AccessHeaders
): Promise<Buffer> {
  const instance = await launchBrowser({ headless: true, storageState });

  try {
    if (accessHeaders) await installAccessHeaders(instance.context, url, accessHeaders);
    const fullUrl = routePath.startsWith("http")
      ? routePath
      : `${url.replace(/\/$/, "")}${routePath}`;

    await instance.page.goto(fullUrl, { waitUntil: "networkidle", timeout: 30_000 });
    // Allow rendering to settle
    await instance.page.waitForTimeout(1000);
    const screenshot = await instance.page.screenshot({ fullPage: true, type: "png" });
    return Buffer.from(screenshot);
  } finally {
    await closeBrowser(instance);
  }
}

// ============================================================
// Storage Helpers
// ============================================================

function buildStorageKey(projectId: string, runId: string, routePath: string): string {
  const sanitized = routePath.replace(/[^a-zA-Z0-9-_/]/g, "_");
  return `visual-qa/${projectId}/${runId}/${sanitized}.png`;
}

async function storeScreenshot(
  key: string,
  data: Buffer,
  projectId: string,
  runId: string
): Promise<string> {
  const storage = getStorage();
  await storage.upload(key, data, "image/png");

  // Store as run artifact
  const artifact = await prisma.runArtifact.create({
    data: {
      projectId,
      testRunId: runId,
      type: "screenshot",
      storageKey: key,
      fileName: key.split("/").pop() ?? "screenshot.png",
      contentType: "image/png",
      sizeBytes: data.length,
      metadata: { source: "visual-qa" } as Prisma.InputJsonValue,
    },
  });
  return artifact.id;
}

/**
 * Persist the outcome on the screenshot artifact so the run detail page can
 * render it later (see loadRunVisualResults).
 */
async function recordResult(
  artifactId: string,
  routePath: string,
  checksum: string,
  result: VisualTestResult
): Promise<VisualTestResult> {
  await prisma.runArtifact.update({
    where: { id: artifactId },
    data: {
      metadata: {
        source: "visual-qa",
        routePath,
        checksum,
        passed: result.passed,
        isBaselineCapture: result.isBaselineCapture,
        baselineKey: result.baselineKey ?? null,
        diff: result.diff ?? null,
        brandCheck: result.brandCheck ?? null,
      } as unknown as Prisma.InputJsonValue,
    },
  });
  return result;
}

// ============================================================
// Load Billing Context
// ============================================================

async function loadBillingContext(
  projectId: string,
  runId: string
): Promise<BillingInfo> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { workspaceId: true },
  });

  return {
    workspaceId: project.workspaceId,
    projectId,
    runId,
  };
}

// ============================================================
// Visual Test Runner
// ============================================================

export async function runVisualTest(
  input: VisualTestInput
): Promise<VisualTestResult> {
  const startTime = Date.now();
  const { runId, projectId, routePath, environmentUrl, checkBrand, diffThreshold, storageState, accessHeaders } = input;

  // 1. Capture screenshot
  const screenshotData = await captureScreenshot(environmentUrl, routePath, storageState, accessHeaders);
  const storageKey = buildStorageKey(projectId, runId, routePath);
  const checksum = computeChecksum(screenshotData);

  const artifactId = await storeScreenshot(storageKey, screenshotData, projectId, runId);

  // 2. Look for existing baseline
  const baseline = await getBaseline(projectId, routePath);
  const billing = await loadBillingContext(projectId, runId);

  // 3. If no baseline exists, this is a baseline capture run
  if (!baseline) {
    await acceptAsBaseline(projectId, runId, routePath, storageKey, checksum);

    let brandCheck: BrandCheckResult | undefined;
    if (checkBrand) {
      brandCheck = await checkBrandConsistency(storageKey, undefined, projectId, billing);
    }

    return recordResult(artifactId, routePath, checksum, {
      passed: true,
      isBaselineCapture: true,
      screenshotKey: storageKey,
      brandCheck,
      durationMs: Date.now() - startTime,
    });
  }

  // 4. Compare against baseline
  const diff = await compareScreenshots(
    baseline.storageKey,
    storageKey,
    { threshold: diffThreshold },
    billing
  );

  // 5. Optionally run brand check
  let brandCheck: BrandCheckResult | undefined;
  if (checkBrand) {
    brandCheck = await checkBrandConsistency(storageKey, undefined, projectId, billing);
  }

  // 6. Determine pass/fail
  const diffPassed = !diff.isRegression;
  const brandPassed = brandCheck ? brandCheck.passed : true;
  const passed = diffPassed && brandPassed;

  return recordResult(artifactId, routePath, checksum, {
    passed,
    isBaselineCapture: false,
    screenshotKey: storageKey,
    diff,
    brandCheck,
    baselineKey: baseline.storageKey,
    durationMs: Date.now() - startTime,
  });
}
