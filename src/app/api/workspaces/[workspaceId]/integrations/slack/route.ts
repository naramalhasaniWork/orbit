/**
 * POST   /api/workspaces/:workspaceId/integrations/slack — Connect (store incoming webhook URL)
 * PATCH  /api/workspaces/:workspaceId/integrations/slack — Update notification preferences
 * DELETE /api/workspaces/:workspaceId/integrations/slack — Disconnect
 *
 * The reporter reads `slackWebhookUrl` from settings; `slack` holds the
 * display state and notification preferences the settings UI renders.
 */

import { NextRequest } from "next/server";
import { sealSecret } from "@/lib/integrations/secret-field";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/rbac";
import { auditSettingsChange } from "@/lib/auth/audit";
import { apiSuccess, apiError, handleApiError } from "@/lib/utils/api";
import {
  patchWorkspaceSettings,
  readWorkspaceSettings,
} from "@/lib/integrations/workspace-settings";

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

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceId } = await params;
    const ctx = await requirePermission(workspaceId, "settings.manage");

    const { webhookUrl } = connectSchema.parse(await request.json());

    const saved = await patchWorkspaceSettings(workspaceId, {
      slackWebhookUrl: sealSecret(webhookUrl),
      slack: { connected: true, notifications: DEFAULT_NOTIFICATIONS },
    });
    if (!saved) return apiError("Workspace not found", "NOT_FOUND", 404);

    await auditSettingsChange(ctx.session.user.id, workspaceId, "integration.slack", {
      action: "connected",
    });

    return apiSuccess({ connected: true, notifications: DEFAULT_NOTIFICATIONS });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceId } = await params;
    await requirePermission(workspaceId, "settings.manage");

    const { notifications } = patchSchema.parse(await request.json());

    const current = await readWorkspaceSettings(workspaceId);
    if (!current) return apiError("Workspace not found", "NOT_FOUND", 404);
    if (!current.slackWebhookUrl) {
      return apiError("Slack is not connected", "NOT_CONNECTED", 409);
    }

    const slack = { ...(current.slack as Record<string, unknown> | undefined), connected: true, notifications };
    await patchWorkspaceSettings(workspaceId, { slack });

    return apiSuccess({ notifications });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceId } = await params;
    const ctx = await requirePermission(workspaceId, "settings.manage");

    const saved = await patchWorkspaceSettings(workspaceId, { slack: { connected: false } }, ["slackWebhookUrl"]);
    if (!saved) return apiError("Workspace not found", "NOT_FOUND", 404);

    await auditSettingsChange(ctx.session.user.id, workspaceId, "integration.slack", {
      action: "disconnected",
    });

    return apiSuccess({ disconnected: true });
  } catch (error) {
    return handleApiError(error);
  }
}
