import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import { requirePermission } from "@/lib/auth/rbac";
import { isAllowedWebhookUrl } from "@/lib/integrations/webhook-url";
import {
  signPayload,
  truncateResponse,
} from "@/services/reporting/integrations/outbound-webhooks";
import {
  readStoredWebhooks,
  resolveWebhookSecret,
} from "@/services/reporting/integrations/webhook-store";

// ============================================================
// POST /api/projects/[projectId]/webhook-deliveries/[deliveryId]/retry
// ============================================================

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; deliveryId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId, deliveryId } = await params;
    await requirePermission(workspaceId, "projects.update");

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

    const response = await fetch(delivery.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Orbit-Signature": `sha256=${signature}`,
        "X-Orbit-Event": delivery.event,
        "X-Orbit-Delivery-Attempt": String(delivery.attempts + 1),
      },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });

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
  } catch (error) {
    return handleApiError(error);
  }
}
