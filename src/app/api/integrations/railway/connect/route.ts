import { NextRequest, NextResponse } from "next/server";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import { connect, disconnect, getRailwayConfig } from "@/services/integrations/railway/service";
import { RailwayApiError } from "@/services/integrations/railway/client";

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace();

    const body = (await req.json()) as { token?: string };
    const token = body.token;

    if (!token || typeof token !== "string") {
      return apiError("Railway API token is required", "MISSING_TOKEN", 400);
    }

    const user = await connect(workspaceId, token);

    return apiSuccess({
      connected: true,
      userName: user.name,
      email: user.email,
    });
  } catch (error) {
    if (error instanceof RailwayApiError) {
      return apiError(error.message, "RAILWAY_API_ERROR", 400);
    }
    return handleApiError(error);
  }
}

export async function DELETE() {
  try {
    const { workspaceId } = await requireWorkspace();
    await disconnect(workspaceId);
    return apiSuccess({ connected: false });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace();
    const config = await getRailwayConfig(workspaceId);

    return apiSuccess({
      connected: !!config,
      railwayProjectId: config?.railwayProjectId ?? null,
      railwayProjectName: config?.railwayProjectName ?? null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
