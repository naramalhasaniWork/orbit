/**
 * GET  /api/projects/:projectId/webhooks — List outbound webhook endpoints
 * POST /api/projects/:projectId/webhooks — Create an endpoint (signing secret returned once)
 *
 * Endpoints are WebhookEndpoint rows (webhook-endpoint-repo), the list the dispatcher
 * in outbound-webhooks.ts reads. Secrets are stored sealed and never listed.
 */

import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { isAllowedWebhookUrl } from "@/lib/integrations/webhook-url";
import { WEBHOOK_EVENTS } from "@/services/reporting/integrations/outbound-webhooks";
import { createProjectEndpoint, listProjectEndpoints } from "@/server/data/webhook-endpoint-repo";
import { route } from "@/server/http/route";

const eventNames = Object.keys(WEBHOOK_EVENTS) as [string, ...string[]];

const createSchema = z.object({
  url: z
    .string()
    .trim()
    .refine(isAllowedWebhookUrl, "URL must be a public https endpoint"),
  events: z.array(z.enum(eventNames)).min(1, "Select at least one event"),
});

function findProject(projectId: string, workspaceId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true },
  });
}

export const GET = route(
  { permission: "projects.view" },
  async ({ params: { projectId }, workspaceId }) => {
    const project = await findProject(projectId, workspaceId);
    if (!project) return apiError("Project not found", "NOT_FOUND", 404);

    return listProjectEndpoints(projectId);
  }
);

export const POST = route(
  { permission: "integrations.manage", body: createSchema },
  async ({ body: { url, events }, params: { projectId }, workspaceId }) => {
    const project = await findProject(projectId, workspaceId);
    if (!project) return apiError("Project not found", "NOT_FOUND", 404);

    const secret = `whsec_${randomBytes(24).toString("hex")}`;
    const endpoint = await createProjectEndpoint({ workspaceId, projectId, url, events, secret });

    return apiSuccess({ secret, endpoint }, 201);
  }
);
