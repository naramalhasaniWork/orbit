import { createHmac } from "crypto";
import { prisma } from "@/lib/db";
import type { RunSummary, FailureSummary } from "@/agents/schemas/run-summary";

// ============================================================
// Types
// ============================================================

const WEBHOOK_EVENTS = {
  "run.started": "run.started",
  "run.completed": "run.completed",
  "run.failed": "run.failed",
  "test.failed": "test.failed",
  "test.flaky": "test.flaky",
  "bug.discovered": "bug.discovered",
  "plan.updated": "plan.updated",
} as const;

type WebhookEvent = keyof typeof WEBHOOK_EVENTS;

interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  projectId: string;
  data: Record<string, unknown>;
}

interface WebhookEndpoint {
  url: string;
  secret: string;
  events: WebhookEvent[];
}

interface DeliveryResult {
  success: boolean;
  statusCode: number | null;
  attempts: number;
}

// ============================================================
// HMAC Signing
// ============================================================

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

// ============================================================
// Delivery with Retry
// ============================================================

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

async function deliverWebhook(
  endpoint: WebhookEndpoint,
  payload: WebhookPayload
): Promise<DeliveryResult> {
  const body = JSON.stringify(payload);
  const signature = signPayload(body, endpoint.secret);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Orbit-Signature": `sha256=${signature}`,
          "X-Orbit-Event": payload.event,
          "X-Orbit-Delivery-Attempt": String(attempt),
        },
        signal: AbortSignal.timeout(10000),
      });

      // Log delivery
      await prisma.webhookDelivery.create({
        data: {
          projectId: payload.projectId,
          event: payload.event,
          url: endpoint.url,
          payload: payload as unknown as Record<string, string>,
          statusCode: response.status,
          attempts: attempt,
          deliveredAt: response.ok ? new Date() : null,
        },
      });

      if (response.ok) {
        return { success: true, statusCode: response.status, attempts: attempt };
      }

      // Don't retry on 4xx (client errors) except 429 (rate limit)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return { success: false, statusCode: response.status, attempts: attempt };
      }
    } catch (error) {
      console.warn(
        `[outbound-webhook] Attempt ${attempt}/${MAX_RETRIES} failed for ${endpoint.url}:`,
        error instanceof Error ? error.message : error
      );

      // Log failed attempt
      await prisma.webhookDelivery.create({
        data: {
          projectId: payload.projectId,
          event: payload.event,
          url: endpoint.url,
          payload: payload as unknown as Record<string, string>,
          statusCode: null,
          attempts: attempt,
          response: error instanceof Error ? error.message : String(error),
        },
      });
    }

    // Exponential backoff before retry
    if (attempt < MAX_RETRIES) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return { success: false, statusCode: null, attempts: MAX_RETRIES };
}

// ============================================================
// Endpoint Resolution
// ============================================================

async function getWebhookEndpoints(
  projectId: string,
  event: WebhookEvent
): Promise<WebhookEndpoint[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { settings: true },
  });

  if (!project) return [];

  const settings = project.settings as Record<string, unknown>;
  const webhooks = settings?.webhooks as Array<{
    url: string;
    secret: string;
    events: string[];
    enabled?: boolean;
  }> | undefined;

  if (!webhooks) return [];

  return webhooks
    .filter((w) => w.enabled !== false && w.events.includes(event))
    .map((w) => ({
      url: w.url,
      secret: w.secret,
      events: w.events as WebhookEvent[],
    }));
}

// ============================================================
// Event Dispatchers
// ============================================================

export async function dispatchRunStarted(
  projectId: string,
  data: { runId: string; mode: string; trigger: string }
): Promise<void> {
  const endpoints = await getWebhookEndpoints(projectId, "run.started");
  const payload: WebhookPayload = {
    event: "run.started",
    timestamp: new Date().toISOString(),
    projectId,
    data,
  };

  await Promise.allSettled(
    endpoints.map((ep) => deliverWebhook(ep, payload))
  );
}

export async function dispatchRunCompleted(
  projectId: string,
  summary: RunSummary
): Promise<void> {
  const endpoints = await getWebhookEndpoints(projectId, "run.completed");
  const payload: WebhookPayload = {
    event: "run.completed",
    timestamp: new Date().toISOString(),
    projectId,
    data: {
      runId: summary.runId,
      totalTests: summary.totalTests,
      passed: summary.passed,
      failed: summary.failed,
      flaky: summary.flaky,
      skipped: summary.skipped,
      durationMs: summary.durationMs,
      summary: summary.summary,
    },
  };

  await Promise.allSettled(
    endpoints.map((ep) => deliverWebhook(ep, payload))
  );
}

export async function dispatchTestFailed(
  projectId: string,
  failure: FailureSummary
): Promise<void> {
  const endpoints = await getWebhookEndpoints(projectId, "test.failed");
  const payload: WebhookPayload = {
    event: "test.failed",
    timestamp: new Date().toISOString(),
    projectId,
    data: {
      testId: failure.testId,
      testName: failure.testName,
      severity: failure.severity,
      explanation: failure.explanation,
      suggestedFix: failure.suggestedFix,
    },
  };

  await Promise.allSettled(
    endpoints.map((ep) => deliverWebhook(ep, payload))
  );
}

export async function dispatchTestFlaky(
  projectId: string,
  data: { testId: string; testName: string; passRate: number }
): Promise<void> {
  const endpoints = await getWebhookEndpoints(projectId, "test.flaky");
  const payload: WebhookPayload = {
    event: "test.flaky",
    timestamp: new Date().toISOString(),
    projectId,
    data,
  };

  await Promise.allSettled(
    endpoints.map((ep) => deliverWebhook(ep, payload))
  );
}

export async function dispatchBugDiscovered(
  projectId: string,
  data: { issueId: string; issueUrl: string; title: string; severity: string }
): Promise<void> {
  const endpoints = await getWebhookEndpoints(projectId, "bug.discovered");
  const payload: WebhookPayload = {
    event: "bug.discovered",
    timestamp: new Date().toISOString(),
    projectId,
    data,
  };

  await Promise.allSettled(
    endpoints.map((ep) => deliverWebhook(ep, payload))
  );
}

export async function dispatchPlanUpdated(
  projectId: string,
  data: { testPlanId: string; version: number; testCaseCount: number }
): Promise<void> {
  const endpoints = await getWebhookEndpoints(projectId, "plan.updated");
  const payload: WebhookPayload = {
    event: "plan.updated",
    timestamp: new Date().toISOString(),
    projectId,
    data,
  };

  await Promise.allSettled(
    endpoints.map((ep) => deliverWebhook(ep, payload))
  );
}

export { WEBHOOK_EVENTS, signPayload };
export type { WebhookEvent, WebhookPayload, WebhookEndpoint, DeliveryResult };
