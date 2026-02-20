import { createHmac } from "crypto";
import { prisma } from "@/lib/db";
import type { WebhookEvent } from "@/lib/webhooks/event-types";

const WEBHOOK_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;

interface DeliveryResult {
  webhookId: string;
  url: string;
  statusCode: number | null;
  success: boolean;
  error: string | null;
}

/**
 * Delivers a webhook event to all registered webhook URLs for a project.
 * Signs the payload with HMAC-SHA256 using the webhook secret.
 * Retries up to MAX_RETRIES on failure.
 */
export async function deliverWebhook(
  projectId: string,
  event: WebhookEvent
): Promise<DeliveryResult[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true },
  });

  if (!project) return [];

  // Look up registered webhooks for this workspace
  // (webhook table may not exist yet — gracefully handle via dynamic access)
  let webhooks: Array<{ id: string; url: string; secret: string; events: string[] }>;
  try {
    const prismaRecord = prisma as unknown as Record<string, { findMany: (args: unknown) => Promise<unknown[]> }>;
    const model = prismaRecord["webhook"];
    if (!model?.findMany) return [];
    webhooks = (await model.findMany({
      where: {
        workspaceId: project.workspaceId,
        isActive: true,
        OR: [
          { events: { has: event.type } },
          { events: { has: "*" } },
        ],
      },
    })) as typeof webhooks;
  } catch {
    // Webhook table not yet created
    return [];
  }

  const results: DeliveryResult[] = [];

  for (const webhook of webhooks) {
    const result = await deliverToUrl(webhook, event);
    results.push(result);
  }

  return results;
}

async function deliverToUrl(
  webhook: { id: string; url: string; secret: string },
  event: WebhookEvent
): Promise<DeliveryResult> {
  const body = JSON.stringify({
    type: event.type,
    payload: event.payload,
    deliveredAt: new Date().toISOString(),
  });

  const signature = createHmac("sha256", webhook.secret)
    .update(body)
    .digest("hex");

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

      const response = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Orbit-Signature": `sha256=${signature}`,
          "X-Orbit-Event": event.type,
          "X-Orbit-Delivery-Attempt": String(attempt + 1),
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok || response.status < 500) {
        return {
          webhookId: webhook.id,
          url: webhook.url,
          statusCode: response.status,
          success: response.ok,
          error: response.ok ? null : `HTTP ${response.status}`,
        };
      }

      // 5xx — retry
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    } catch (err) {
      if (attempt >= MAX_RETRIES) {
        return {
          webhookId: webhook.id,
          url: webhook.url,
          statusCode: null,
          success: false,
          error: err instanceof Error ? err.message : "Delivery failed",
        };
      }
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }

  return {
    webhookId: webhook.id,
    url: webhook.url,
    statusCode: null,
    success: false,
    error: `Failed after ${MAX_RETRIES + 1} attempts`,
  };
}
