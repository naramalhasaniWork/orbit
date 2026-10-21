/**
 * POST   /api/workspaces/:workspaceId/integrations/linear — Connect (validate + store encrypted API key)
 * PATCH  /api/workspaces/:workspaceId/integrations/linear — Toggle auto-create issues, pick the inbound project
 * DELETE /api/workspaces/:workspaceId/integrations/linear — Disconnect
 *
 * The connection lives in IntegrationConfig (provider "linear"): the API key sealed in
 * credentialsSealed, the team as externalAccountId/displayName. linear.ts reads it back.
 */

import { z } from "zod";
import { auditSettingsChange } from "@/lib/auth/audit";
import { apiError } from "@/lib/utils/api";
import {
  connectIntegration,
  disconnectIntegration,
  patchIntegrationSettings,
} from "@/server/data/integration-repo";
import { lookupLinearTeam } from "@/services/reporting/integrations/linear";
import { route } from "@/server/http/route";

const connectSchema = z.object({
  apiKey: z.string().trim().min(1, "API key is required"),
  teamId: z.string().trim().min(1).optional(),
});

const patchSchema = z
  .object({
    autoCreateIssues: z.boolean().optional(),
    /** Project the inbound Linear webhook runs against; null falls back to the only active project. */
    inboundProjectId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => v.autoCreateIssues !== undefined || v.inboundProjectId !== undefined, "Nothing to update");

export const POST = route(
  { workspace: "param", permission: "settings.manage", body: connectSchema },
  async ({ body: { apiKey, teamId }, workspaceId, session, db }) => {
    let team: { teamId: string; teamName: string } | null;
    try {
      team = await lookupLinearTeam(apiKey, teamId);
    } catch {
      return apiError("Linear rejected this API key", "INVALID_CREDENTIALS", 400);
    }
    if (!team) {
      return apiError("No Linear team found for this API key", "NOT_FOUND", 404);
    }

    await connectIntegration(workspaceId, "linear", {
      secret: apiKey,
      externalAccountId: team.teamId,
      displayName: team.teamName,
      settings: { autoCreateIssues: true },
    });

    await auditSettingsChange(session.user.id, workspaceId, "integration.linear", {
      action: "connected",
      teamId: team.teamId,
    });

    return { connected: true, ...team, autoCreateIssues: true };
  }
);

export const PATCH = route(
  { workspace: "param", permission: "settings.manage", body: patchSchema },
  async ({ body, workspaceId, db }) => {
    if (body.inboundProjectId) {
      const project = await db.project.findFirst({
        where: { id: body.inboundProjectId, workspaceId },
        select: { id: true },
      });
      if (!project) return apiError("Project not found", "NOT_FOUND", 404);
    }
    const saved = await patchIntegrationSettings(workspaceId, "linear", body);
    if (!saved) return apiError("Linear is not connected", "NOT_CONNECTED", 409);
    return body;
  }
);

export const DELETE = route(
  { workspace: "param", permission: "settings.manage" },
  async ({ workspaceId, session, db }) => {
    await disconnectIntegration(workspaceId, "linear");

    await auditSettingsChange(session.user.id, workspaceId, "integration.linear", {
      action: "disconnected",
    });

    return { disconnected: true };
  }
);
