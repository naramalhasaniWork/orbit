import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { isAllowedWebhookUrl } from "@/lib/integrations/webhook-url";
import { safeFetch } from "@/lib/utils/ssrf";
import {
  signPayload,
  truncateResponse,
} from "@/services/reporting/integrations/outbound-webhooks";
import {
  readStoredWebhooks,
  resolveWebhookSecret,
} from "@/services/reporting/integrations/webhook-store";
import { route } from "@/server/http/route";

// ============================================================
// POST /api/projects/[projectId]/webhook-deliveries/[deliveryId]/retry
// ============================================================

export const POST = route(
  { permission: "integrations.manage" },
  async ({ params: { projectId, deliveryId }, workspaceId }) => {
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true, settings: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const delivery = await prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, projectId },
    });

    if (!delivery) {
      return apiError("Delivery not found", "NOT_FOUND", 404);
    }

    // Find the webhook endpoint secret from project settings
    const endpoint = readStoredWebhooks(project.settings).find((w) => w.url === delivery.url);
    const secret = endpoint ? resolveWebhookSecret(endpoint) : null;
    if (!endpoint || !secret) {
      return apiError(
        "This endpoint no longer exists or its secret cannot be resolved",
        "ENDPOINT_UNAVAILABLE",
        409
      );
    }
    if (!isAllowedWebhookUrl(delivery.url)) {
      return apiError("Endpoint URL is not allowed", "ENDPOINT_UNAVAILABLE", 409);
    }

    const body = JSON.stringify(delivery.payload);
    const signature = signPayload(body, secret);

    const response = await safeFetch(delivery.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Orbit-Signature": `sha256=${signature}`,
        "X-Orbit-Event": delivery.event,
        "X-Orbit-Delivery-Attempt": String(delivery.attempts + 1),
      },
      body,
      signal: AbortSignal.timeout(10000),
    }, { followRedirects: false });

    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        statusCode: response.status,
        attempts: delivery.attempts + 1,
        deliveredAt: response.ok ? new Date() : null,
        response: response.ok
          ? null
          : truncateResponse(await response.text().catch(() => "")) || null,
      },
    });

    return apiSuccess({
      retried: true,
      statusCode: response.status,
      success: response.ok,
    });
  }
);
