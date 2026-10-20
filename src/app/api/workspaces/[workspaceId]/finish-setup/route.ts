/** POST /api/workspaces/:workspaceId/finish-setup — dismiss the one-time "Finish setup" card. */

import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/rbac";
import { auditSettingsChange } from "@/lib/auth/audit";
import { apiSuccess, apiError, handleApiError } from "@/lib/utils/api";
import { patchWorkspaceSettings } from "@/lib/integrations/workspace-settings";
import { FINISH_SETUP_SETTING } from "@/lib/setup/finish-setup";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const ctx = await requirePermission(workspaceId, "settings.manage");

    const saved = await patchWorkspaceSettings(workspaceId, { [FINISH_SETUP_SETTING]: true });
    if (!saved) return apiError("Workspace not found", "NOT_FOUND", 404);

    await auditSettingsChange(ctx.session.user.id, workspaceId, FINISH_SETUP_SETTING, { dismissed: true });
    return apiSuccess({ dismissed: true });
  } catch (error) {
    return handleApiError(error);
  }
}
