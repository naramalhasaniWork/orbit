/** POST /api/workspaces/:workspaceId/finish-setup — dismiss the one-time "Finish setup" card. */

import { auditSettingsChange } from "@/lib/auth/audit";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { patchWorkspaceSettings } from "@/server/data/settings-repo";
import { FINISH_SETUP_SETTING } from "@/lib/setup/finish-setup";
import { route } from "@/server/http/route";

export const POST = route(
  { workspace: "param", permission: "settings.manage" },
  async ({ workspaceId, session }) => {
    const saved = await patchWorkspaceSettings(workspaceId, { [FINISH_SETUP_SETTING]: true });
    if (!saved) return apiError("Workspace not found", "NOT_FOUND", 404);

    await auditSettingsChange(session.user.id, workspaceId, FINISH_SETUP_SETTING, { dismissed: true });
    return apiSuccess({ dismissed: true });
  }
);
