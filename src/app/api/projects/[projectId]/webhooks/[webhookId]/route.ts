/**
 * PATCH  /api/projects/:projectId/webhooks/:webhookId — Enable/disable or change events
 * DELETE /api/projects/:projectId/webhooks/:webhookId — Remove an endpoint
 */

import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/utils/api";
import { WEBHOOK_EVENTS } from "@/services/reporting/integrations/outbound-webhooks";
import { deleteProjectEndpoint, updateProjectEndpoint } from "@/server/data/webhook-endpoint-repo";
import { route } from "@/server/http/route";

const eventNames = Object.keys(WEBHOOK_EVENTS) as [string, ...string[]];

const patchSchema = z
  .object({
    isEnabled: z.boolean().optional(),
    events: z.array(z.enum(eventNames)).min(1, "Select at least one event").optional(),
  })
  .refine((v) => v.isEnabled !== undefined || v.events !== undefined, "Nothing to update");

const params = z.object({ projectId: z.string(), webhookId: z.string().uuid() });

function findProject(projectId: string, workspaceId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true },
  });
}

export const PATCH = route(
  { permission: "integrations.manage", params, body: patchSchema },
  async ({ body, params: { projectId, webhookId }, workspaceId }) => {
    const project = await findProject(projectId, workspaceId);
    if (!project) return apiError("Project not found", "NOT_FOUND", 404);

    const updated = await updateProjectEndpoint(projectId, webhookId, body);
    if (!updated) return apiError("Webhook not found", "NOT_FOUND", 404);

    return { updated: true };
  }
);

export const DELETE = route(
  { permission: "integrations.manage", params },
  async ({ params: { projectId, webhookId }, workspaceId }) => {
    const project = await findProject(projectId, workspaceId);
    if (!project) return apiError("Project not found", "NOT_FOUND", 404);

    const deleted = await deleteProjectEndpoint(projectId, webhookId);
    if (!deleted) return apiError("Webhook not found", "NOT_FOUND", 404);

    return { deleted: true };
  }
);
