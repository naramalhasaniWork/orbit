import { apiSuccess, apiError } from "@/lib/utils/api";
import { listProviderTargets } from "@/services/preview/connection-service";
import { parseProviderParam, mapPreviewError } from "@/services/preview/http";
import { route } from "@/server/http/route";

/** GET: what a project can bind to (Railway services, Cloudflare Pages projects). */
export const GET = route(
  { permission: "integrations.view", onError: mapPreviewError },
  async ({ params, workspaceId }) => {
    const provider = parseProviderParam(params.provider);
    if (!provider) return apiError("Unknown provider", "NOT_FOUND", 404);

    return apiSuccess({ targets: await listProviderTargets(workspaceId, provider) });
  }
);
