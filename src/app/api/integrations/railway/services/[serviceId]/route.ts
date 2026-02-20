import { NextRequest } from "next/server";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import {
  getServiceStatus,
  getDeployments,
  getEnvironmentVariables,
  getRailwayConfig,
} from "@/services/integrations/railway/service";
import { RailwayApiError } from "@/services/integrations/railway/client";

interface RouteParams {
  params: Promise<{ serviceId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { serviceId } = await params;

    const environmentId = req.nextUrl.searchParams.get("environmentId");
    if (!environmentId) {
      return apiError("environmentId query param is required", "MISSING_PARAM", 400);
    }

    const config = await getRailwayConfig(workspaceId);
    if (!config?.railwayProjectId) {
      return apiError("No Railway project connected", "NOT_CONNECTED", 400);
    }

    const [status, deployments] = await Promise.all([
      getServiceStatus(workspaceId, serviceId, environmentId),
      getDeployments(workspaceId, serviceId, environmentId, 5),
    ]);

    return apiSuccess({
      status,
      recentDeployments: deployments,
    });
  } catch (error) {
    if (error instanceof RailwayApiError) {
      return apiError(error.message, "RAILWAY_API_ERROR", 400);
    }
    return handleApiError(error);
  }
}
