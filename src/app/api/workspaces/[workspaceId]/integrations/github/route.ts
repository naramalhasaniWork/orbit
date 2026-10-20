import { prisma } from "@/lib/db";
import { patchWorkspaceSettings } from "@/server/data/settings-repo";
import { route } from "@/server/http/route";

/** DELETE /api/workspaces/:workspaceId/integrations/github — unlink every GitHub App installation. */
export const DELETE = route(
  { workspace: "param", permission: "integrations.manage" },
  async ({ workspaceId }) => {
    await prisma.gitHubInstallation.deleteMany({
      where: { workspaceId },
    });

    await patchWorkspaceSettings(workspaceId, { github: { connected: false } });

    return { disconnected: true };
  }
);
