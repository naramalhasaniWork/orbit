import { prisma } from "@/lib/db";
import { redactSettings } from "@/lib/integrations/redact";
import { apiSuccess, apiError } from "@/lib/utils/api";
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

export const PATCH = route(
  { workspace: "param", permission: "settings.manage" },
  async ({ req: request, workspaceId }) => {
    const body = await request.json();
    const { customPrompt } = body as { customPrompt?: string };

    if (customPrompt !== undefined && typeof customPrompt !== "string") {
      return apiError("customPrompt must be a string", "VALIDATION_ERROR", 400);
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { settings: true },
    });

    if (!workspace) {
      return apiError("Workspace not found", "NOT_FOUND", 404);
    }

    const currentSettings = (workspace.settings ?? {}) as Record<string, unknown>;
    const updatedSettings = {
      ...currentSettings,
      ...(customPrompt !== undefined ? { customPrompt } : {}),
    };

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { settings: updatedSettings },
    });

    return apiSuccess(redactSettings(updatedSettings));
  }
);
