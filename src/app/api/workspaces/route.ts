import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireAuth,
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import { generateSlug } from "@/lib/utils/slug";

export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace();

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return apiError("Workspace not found", "NOT_FOUND", 404);
    }

    return apiSuccess(workspace);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    const body = await request.json();
    const { name } = body as { name?: string };

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return apiError("Workspace name is required", "VALIDATION_ERROR", 400);
    }

    const slug = generateSlug(name);

    const workspace = await prisma.workspace.create({
      data: { name: name.trim(), slug },
    });

    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: session.user.id,
        role: "admin",
      },
    });

    return apiSuccess(workspace, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
