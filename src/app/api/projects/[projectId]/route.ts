import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    return apiSuccess(project);
  } catch (error) {
    return handleApiError(error);
  }
}

interface UpdateProjectBody {
  name?: string;
  defaultBranch?: string;
  onboardingCompleted?: boolean;
  settings?: Record<string, unknown>;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const body = (await request.json()) as UpdateProjectBody;
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      data.name = body.name;
    }
    if (body.defaultBranch !== undefined) {
      data.defaultBranch = body.defaultBranch;
    }
    if (body.onboardingCompleted !== undefined) {
      data.onboardingCompleted = body.onboardingCompleted;
    }
    if (body.settings !== undefined) {
      data.settings = body.settings;
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data,
    });

    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
