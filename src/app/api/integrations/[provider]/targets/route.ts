import { NextRequest } from "next/server";
import { requireWorkspace, apiSuccess, apiError } from "@/lib/utils/api";
import { requirePermission } from "@/lib/auth/rbac";
import { listProviderTargets } from "@/services/preview/connection-service";
import { parseProviderParam, previewApiError } from "@/services/preview/http";

interface RouteParams {
  params: Promise<{ provider: string }>;
}

/** GET: what a project can bind to (Railway services, Cloudflare Pages projects). */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceId } = await requireWorkspace();
    await requirePermission(workspaceId, "integrations.view");
    const provider = parseProviderParam((await params).provider);
    if (!provider) return apiError("Unknown provider", "NOT_FOUND", 404);

    return apiSuccess({ targets: await listProviderTargets(workspaceId, provider) });
  } catch (error) {
    return previewApiError(error);
  }
}
