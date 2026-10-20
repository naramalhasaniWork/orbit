import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { syncEnvironments } from "@/services/integrations/railway/environment-sync";
import { connectionAccess } from "@/services/preview/connections";
import { mapPreviewError } from "@/services/preview/http";
import { parseRailwayTarget, wrapRailwayError } from "@/services/preview/providers/railway";
import { route } from "@/server/http/route";

/** POST: import the bound Railway service's long-lived environments as Orbit environments. */
export const POST = route(
  { permission: "secrets.manage", onError: mapPreviewError },
  async ({ params: { projectId }, workspaceId }) => {
    const binding = await prisma.previewBinding.findFirst({
      where: { projectId, project: { workspaceId } },
      include: { connection: true },
    });
    const target = binding && parseRailwayTarget(binding.targetRef);
    if (!binding || binding.connection.provider !== "railway" || !target) {
      return apiError("Bind this project to a Railway service first", "NOT_FOUND", 404);
    }
    const access = connectionAccess(binding.connection);
    if (!access) return apiError("Reconnect Railway in Settings → Integrations", "NOT_CONNECTED", 400);

    const result = await syncEnvironments(access.token, target, projectId).catch(wrapRailwayError);
    return apiSuccess(result);
  }
);
