import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireWorkspace, apiSuccess, apiError } from "@/lib/utils/api";
import { requirePermission } from "@/lib/auth/rbac";
import { syncEnvironments } from "@/services/integrations/railway/environment-sync";
import { connectionAccess } from "@/services/preview/connections";
import { previewApiError } from "@/services/preview/http";
import { parseRailwayTarget, wrapRailwayError } from "@/services/preview/providers/railway";

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/** POST: import the bound Railway service's long-lived environments as Orbit environments. */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceId } = await requireWorkspace();
    await requirePermission(workspaceId, "secrets.manage");
    const { projectId } = await params;

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
  } catch (error) {
    return previewApiError(error);
  }
}
