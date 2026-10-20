/**
 * POST   /api/workspaces/:workspaceId/integrations/slack — Connect (store incoming webhook URL)
 * PATCH  /api/workspaces/:workspaceId/integrations/slack — Update notification preferences
 * DELETE /api/workspaces/:workspaceId/integrations/slack — Disconnect
 *
 * The connection lives in IntegrationConfig (provider "slack"): the webhook URL sealed
 * in credentialsSealed, notification preferences in settings. The reporter reads both.
 */

import { z } from "zod";
import { auditSettingsChange } from "@/lib/auth/audit";
import { apiError } from "@/lib/utils/api";
import {
  connectIntegration,
  disconnectIntegration,
  patchIntegrationSettings,
} from "@/server/data/integration-repo";
import { route } from "@/server/http/route";

const SLACK_WEBHOOK_PATTERN = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+$/;

const connectSchema = z.object({
  webhookUrl: z
    .string()
    .trim()
    .regex(SLACK_WEBHOOK_PATTERN, "Must be a Slack incoming webhook URL (https://hooks.slack.com/services/...)"),
});

const patchSchema = z.object({
  notifications: z.object({ runCompleted: z.boolean(), testFailed: z.boolean() }),
});

export const POST = route(
  { workspace: "param", permission: "settings.manage", body: connectSchema },
  async ({ body: { webhookUrl }, workspaceId, session }) => {
    const { settings } = await connectIntegration(workspaceId, "slack", { secret: webhookUrl });

    await auditSettingsChange(session.user.id, workspaceId, "integration.slack", {
      action: "connected",
    });

    return { connected: true, notifications: settings.notifications };
  }
);

export const PATCH = route(
  { workspace: "param", permission: "settings.manage", body: patchSchema },
  async ({ body: { notifications }, workspaceId }) => {
    const saved = await patchIntegrationSettings(workspaceId, "slack", { notifications });
    if (!saved) return apiError("Slack is not connected", "NOT_CONNECTED", 409);
    return { notifications };
  }
);

export const DELETE = route(
  { workspace: "param", permission: "settings.manage" },
  async ({ workspaceId, session }) => {
    await disconnectIntegration(workspaceId, "slack");

    await auditSettingsChange(session.user.id, workspaceId, "integration.slack", {
      action: "disconnected",
    });

    return { disconnected: true };
  }
);
