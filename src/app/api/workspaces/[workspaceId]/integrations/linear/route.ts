/**
 * POST   /api/workspaces/:workspaceId/integrations/linear — Connect (validate + store encrypted API key)
 * PATCH  /api/workspaces/:workspaceId/integrations/linear — Toggle auto-create issues
 * DELETE /api/workspaces/:workspaceId/integrations/linear — Disconnect
 *
 * linear.ts reads `linearApiKey` (sealed with the vault) and `linearTeamId`
 * from settings; `linear` holds the display state the settings UI renders.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/rbac";
import { auditSettingsChange } from "@/lib/auth/audit";
import { apiSuccess, apiError, handleApiError } from "@/lib/utils/api";
import { sealSecret } from "@/lib/integrations/secret-field";
import {
  patchWorkspaceSettings,
  readWorkspaceSettings,
} from "@/lib/integrations/workspace-settings";
import { lookupLinearTeam } from "@/services/reporting/integrations/linear";

const connectSchema = z.object({
  apiKey: z.string().trim().min(1, "API key is required"),
  teamId: z.string().trim().min(1).optional(),
});

const patchSchema = z.object({ autoCreateIssues: z.boolean() });

type RouteContext = { params: Promise<{ workspaceId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceId } = await params;
    const ctx = await requirePermission(workspaceId, "settings.manage");

    const { apiKey, teamId } = connectSchema.parse(await request.json());

    let team: { teamId: string; teamName: string } | null;
    try {
      team = await lookupLinearTeam(apiKey, teamId);
    } catch {
      return apiError("Linear rejected this API key", "INVALID_CREDENTIALS", 400);
    }
    if (!team) {
      return apiError("No Linear team found for this API key", "NOT_FOUND", 404);
    }

    const saved = await patchWorkspaceSettings(workspaceId, {
      linearApiKey: sealSecret(apiKey),
      linearTeamId: team.teamId,
      linear: {
        connected: true,
        teamId: team.teamId,
        teamName: team.teamName,
        autoCreateIssues: true,
      },
    });
    if (!saved) return apiError("Workspace not found", "NOT_FOUND", 404);

    await auditSettingsChange(ctx.session.user.id, workspaceId, "integration.linear", {
      action: "connected",
      teamId: team.teamId,
    });

    return apiSuccess({ connected: true, ...team, autoCreateIssues: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceId } = await params;
    await requirePermission(workspaceId, "settings.manage");

    const { autoCreateIssues } = patchSchema.parse(await request.json());

    const current = await readWorkspaceSettings(workspaceId);
    if (!current) return apiError("Workspace not found", "NOT_FOUND", 404);
    if (!current.linearApiKey) {
      return apiError("Linear is not connected", "NOT_CONNECTED", 409);
    }

    const linear = { ...(current.linear as Record<string, unknown> | undefined), connected: true, autoCreateIssues };
    await patchWorkspaceSettings(workspaceId, { linear });

    return apiSuccess({ autoCreateIssues });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceId } = await params;
    const ctx = await requirePermission(workspaceId, "settings.manage");

    const saved = await patchWorkspaceSettings(
      workspaceId,
      { linear: { connected: false, autoCreateIssues: false } },
      ["linearApiKey", "linearTeamId"]
    );
    if (!saved) return apiError("Workspace not found", "NOT_FOUND", 404);

    await auditSettingsChange(ctx.session.user.id, workspaceId, "integration.linear", {
      action: "disconnected",
    });

    return apiSuccess({ disconnected: true });
  } catch (error) {
    return handleApiError(error);
  }
}
