import { z } from "zod";
import { prisma } from "@/lib/db";
import { redactSettings } from "@/lib/integrations/redact";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { patchWorkspaceSettings, readWorkspaceSettings } from "@/server/data/settings-repo";
import { route } from "@/server/http/route";

export const GET = route(
  { workspace: "param", permission: "settings.view" },
  async ({ workspaceId }) => {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { settings: true },
    });

    if (!workspace) {
      return apiError("Workspace not found", "NOT_FOUND", 404);
    }

    return apiSuccess(redactSettings(workspace.settings));
  }
);

const patchSchema = z.object({ customPrompt: z.string({ message: "customPrompt must be a string" }).optional() });

export const PATCH = route(
  { workspace: "param", permission: "settings.manage", body: patchSchema },
  async ({ body: { customPrompt }, workspaceId }) => {
    if (customPrompt !== undefined) {
      const saved = await patchWorkspaceSettings(workspaceId, { customPrompt });
      if (!saved) return apiError("Workspace not found", "NOT_FOUND", 404);
    }

    const settings = await readWorkspaceSettings(workspaceId);
    if (!settings) return apiError("Workspace not found", "NOT_FOUND", 404);
    return redactSettings(settings);
  }
);
