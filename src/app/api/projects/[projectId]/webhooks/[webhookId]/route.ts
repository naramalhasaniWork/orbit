/**
 * PATCH  /api/projects/:projectId/webhooks/:webhookId — Enable/disable or change events
 * DELETE /api/projects/:projectId/webhooks/:webhookId — Remove an endpoint
 */

import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { WEBHOOK_EVENTS } from "@/services/reporting/integrations/outbound-webhooks";
import { updateProjectWebhooks } from "@/services/reporting/integrations/webhook-store";
import { route } from "@/server/http/route";

const eventNames = Object.keys(WEBHOOK_EVENTS) as [string, ...string[]];

const patchSchema = z
  .object({
    isEnabled: z.boolean().optional(),
    events: z.array(z.enum(eventNames)).min(1, "Select at least one event").optional(),
  })
  .refine((v) => v.isEnabled !== undefined || v.events !== undefined, "Nothing to update");

type RouteContext = { params: Promise<{ projectId: string; webhookId: string }> };

function findProject(projectId: string, workspaceId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true },
  });
}

export const PATCH = route(
  { permission: "integrations.manage" },
  async ({ req: request, params: { projectId, webhookId }, workspaceId }) => {
    const project = await findProject(projectId, workspaceId);
    if (!project) return apiError("Project not found", "NOT_FOUND", 404);

    const { isEnabled, events } = patchSchema.parse(await request.json());

    let found = false;
    await updateProjectWebhooks(projectId, (all) =>
      all.map((w) => {
        if (w.id !== webhookId) return w;
        found = true;
        return {
          ...w,
          ...(isEnabled !== undefined ? { enabled: isEnabled } : {}),
          ...(events ? { events } : {}),
        };
      })
    );
    if (!found) return apiError("Webhook not found", "NOT_FOUND", 404);

    return apiSuccess({ updated: true });
  }
);

export const DELETE = route(
  { permission: "integrations.manage" },
  async ({ params: { projectId, webhookId }, workspaceId }) => {
    const project = await findProject(projectId, workspaceId);
    if (!project) return apiError("Project not found", "NOT_FOUND", 404);

    let found = false;
    await updateProjectWebhooks(projectId, (all) =>
      all.filter((w) => {
        if (w.id === webhookId) found = true;
        return w.id !== webhookId;
      })
    );
    if (!found) return apiError("Webhook not found", "NOT_FOUND", 404);

    return apiSuccess({ deleted: true });
  }
);
