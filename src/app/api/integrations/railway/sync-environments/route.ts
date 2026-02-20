import { NextRequest } from "next/server";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import { syncEnvironments } from "@/services/integrations/railway/environment-sync";
import { RailwayApiError } from "@/services/integrations/railway/client";

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace();

    const body = (await req.json()) as { projectId?: string };
    if (!body.projectId) {
      return apiError("projectId (Orbit project) is required", "MISSING_FIELD", 400);
    }

    const result = await syncEnvironments(workspaceId, body.projectId);

    return apiSuccess(result);
  } catch (error) {
    if (error instanceof RailwayApiError) {
      return apiError(error.message, "RAILWAY_API_ERROR", 400);
    }
    if (error instanceof Error) {
      return apiError(error.message, "SYNC_ERROR", 400);
    }
    return handleApiError(error);
  }
}
