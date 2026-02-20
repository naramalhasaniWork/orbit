import { NextRequest, NextResponse } from "next/server";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import {
  listProjects,
  getProjectDetails,
  updateConfig,
} from "@/services/integrations/railway/service";
import { RailwayApiError } from "@/services/integrations/railway/client";

export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace();
    const projects = await listProjects(workspaceId);
    return apiSuccess({ projects });
  } catch (error) {
    if (error instanceof RailwayApiError) {
      return apiError(error.message, "RAILWAY_API_ERROR", 400);
    }
    return handleApiError(error);
  }
}

/**
 * POST: Select a Railway project to connect to this workspace
 */
export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace();

    const body = (await req.json()) as {
      railwayProjectId?: string;
    };

    if (!body.railwayProjectId) {
      return apiError("railwayProjectId is required", "MISSING_FIELD", 400);
    }

    const details = await getProjectDetails(
      workspaceId,
      body.railwayProjectId
    );

    await updateConfig(workspaceId, {
      railwayProjectId: details.project.id,
      railwayProjectName: details.project.name,
    });

    return apiSuccess({
      project: details.project,
      services: details.services,
      environments: details.environments,
    });
  } catch (error) {
    if (error instanceof RailwayApiError) {
      return apiError(error.message, "RAILWAY_API_ERROR", 400);
    }
    return handleApiError(error);
  }
}
