/**
 * POST   /api/workspaces/:workspaceId/integrations/slack — Connect (store incoming webhook URL)
 * PATCH  /api/workspaces/:workspaceId/integrations/slack — Update notification preferences
 * DELETE /api/workspaces/:workspaceId/integrations/slack — Disconnect
 *
 * The reporter reads `slackWebhookUrl` from settings; `slack` holds the
 * display state and notification preferences the settings UI renders.
 */

import { z } from "zod";
import { auditSettingsChange } from "@/lib/auth/audit";
import { apiSuccess, apiError } from "@/lib/utils/api";
import {
  patchWorkspaceSettings,
  readWorkspaceSettings,
} from "@/lib/integrations/workspace-settings";
import { route } from "@/server/http/route";

const SLACK_WEBHOOK_PATTERN = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+$/;

const notificationsSchema = z.object({
  runCompleted: z.boolean(),
  testFailed: z.boolean(),
});

const connectSchema = z.object({
  webhookUrl: z
    .string()
    .trim()
    .regex(SLACK_WEBHOOK_PATTERN, "Must be a Slack incoming webhook URL (https://hooks.slack.com/services/...)"),
});

const patchSchema = z.object({ notifications: notificationsSchema });

const DEFAULT_NOTIFICATIONS = { runCompleted: true, testFailed: true };

type RouteContext = { params: Promise<{ workspaceId: string }> };

export const POST = route(
  { workspace: "param", permission: "settings.manage" },
  async ({ req: request, workspaceId, session }) => {
    const { webhookUrl } = connectSchema.parse(await request.json());

    const saved = await patchWorkspaceSettings(workspaceId, {
      slackWebhookUrl: webhookUrl,
      slack: { connected: true, notifications: DEFAULT_NOTIFICATIONS },
    });
    if (!saved) return apiError("Workspace not found", "NOT_FOUND", 404);

    await auditSettingsChange(session.user.id, workspaceId, "integration.slack", {
      action: "connected",
    });

    return apiSuccess({ connected: true, notifications: DEFAULT_NOTIFICATIONS });
  }
);

export const PATCH = route(
  { workspace: "param", permission: "settings.manage" },
  async ({ req: request, workspaceId }) => {
    const { notifications } = patchSchema.parse(await request.json());

    const current = await readWorkspaceSettings(workspaceId);
    if (!current) return apiError("Workspace not found", "NOT_FOUND", 404);
    if (!current.slackWebhookUrl) {
      return apiError("Slack is not connected", "NOT_CONNECTED", 409);
    }

    const slack = { ...(current.slack as Record<string, unknown> | undefined), connected: true, notifications };
    await patchWorkspaceSettings(workspaceId, { slack });

    return apiSuccess({ notifications });
  }
);

export const DELETE = route(
  { workspace: "param", permission: "settings.manage" },
  async ({ workspaceId, session }) => {
    const saved = await patchWorkspaceSettings(workspaceId, { slack: { connected: false } }, ["slackWebhookUrl"]);
    if (!saved) return apiError("Workspace not found", "NOT_FOUND", 404);

    await auditSettingsChange(session.user.id, workspaceId, "integration.slack", {
      action: "disconnected",
    });

    return apiSuccess({ disconnected: true });
  }
);
