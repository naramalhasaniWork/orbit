import { NextRequest } from "next/server";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import { triggerDeploy } from "@/services/integrations/railway/service";
import { RailwayApiError } from "@/services/integrations/railway/client";

interface RouteParams {
  params: Promise<{ serviceId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { serviceId } = await params;

    const body = (await req.json()) as { environmentId?: string };
    if (!body.environmentId) {
      return apiError("environmentId is required", "MISSING_FIELD", 400);
    }

    const deployment = await triggerDeploy(
      workspaceId,
      serviceId,
      body.environmentId
    );

    return apiSuccess({
      deploymentId: deployment.id,
      status: deployment.status,
    });
  } catch (error) {
    if (error instanceof RailwayApiError) {
      return apiError(error.message, "RAILWAY_API_ERROR", 400);
    }
    return handleApiError(error);
  }
}
