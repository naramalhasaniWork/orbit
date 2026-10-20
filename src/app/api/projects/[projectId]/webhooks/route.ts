/**
 * GET  /api/projects/:projectId/webhooks — List outbound webhook endpoints
 * POST /api/projects/:projectId/webhooks — Create an endpoint (signing secret returned once)
 *
 * Endpoints live in project.settings.webhooks, the list the dispatcher in
 * outbound-webhooks.ts reads. Secrets are stored sealed and never listed.
 */

import { NextRequest } from "next/server";
import { randomBytes, randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/rbac";
import { requireWorkspace, apiSuccess, apiError, handleApiError } from "@/lib/utils/api";
import { sealSecret } from "@/lib/integrations/secret-field";
import { isAllowedWebhookUrl } from "@/lib/integrations/webhook-url";
import { WEBHOOK_EVENTS } from "@/services/reporting/integrations/outbound-webhooks";
import {
  readStoredWebhooks,
  updateProjectWebhooks,
  type StoredWebhook,
} from "@/services/reporting/integrations/webhook-store";

const eventNames = Object.keys(WEBHOOK_EVENTS) as [string, ...string[]];

const createSchema = z.object({
  url: z
    .string()
    .trim()
    .refine(isAllowedWebhookUrl, "URL must be a public https endpoint"),
  events: z.array(z.enum(eventNames)).min(1, "Select at least one event"),
});

type RouteContext = { params: Promise<{ projectId: string }> };

function toEndpointView(webhook: StoredWebhook & { id: string }) {
  return {
    id: webhook.id,
    url: webhook.url,
    events: webhook.events,
    isEnabled: webhook.enabled !== false,
  };
}

async function findProject(projectId: string, workspaceId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true, settings: true },
  });
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;
    await requirePermission(workspaceId, "projects.view");

    const project = await findProject(projectId, workspaceId);
    if (!project) return apiError("Project not found", "NOT_FOUND", 404);

    let webhooks = readStoredWebhooks(project.settings);

    // Entries written outside these routes may lack an id; assign one so they can be managed.
    if (webhooks.some((w) => !w.id)) {
      webhooks =
        (await updateProjectWebhooks(projectId, (all) =>
          all.map((w) => (w.id ? w : { ...w, id: randomUUID() }))
        )) ?? webhooks;
    }

    return apiSuccess(webhooks.map((w) => toEndpointView(w as StoredWebhook & { id: string })));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;
    await requirePermission(workspaceId, "integrations.manage");

    const { url, events } = createSchema.parse(await request.json());

    const project = await findProject(projectId, workspaceId);
    if (!project) return apiError("Project not found", "NOT_FOUND", 404);

    const secret = `whsec_${randomBytes(24).toString("hex")}`;
    const endpoint: StoredWebhook & { id: string } = {
      id: randomUUID(),
      url,
      events,
      enabled: true,
      secretSealed: sealSecret(secret),
    };

    await updateProjectWebhooks(projectId, (all) => [...all, endpoint]);

    return apiSuccess({ secret, endpoint: toEndpointView(endpoint) }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
