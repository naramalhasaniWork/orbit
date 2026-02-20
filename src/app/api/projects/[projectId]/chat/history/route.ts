import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";

// ============================================================
// GET /api/projects/[projectId]/chat/history — Get chat messages
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { session, workspaceId } = await requireWorkspace();
    const { projectId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const limit = Math.min(
      Number(request.nextUrl.searchParams.get("limit")) || 50,
      200
    );

    // Find the active conversation
    const conversation = await prisma.conversation.findFirst({
      where: {
        projectId,
        userId: session.user.id,
        isActive: true,
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, createdAt: true },
    });

    if (!conversation) {
      return apiSuccess({ conversationId: null, messages: [] });
    }

    const messages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: {
        id: true,
        role: true,
        content: true,
        toolName: true,
        toolArgs: true,
        toolResult: true,
        createdAt: true,
      },
    });

    return apiSuccess({
      conversationId: conversation.id,
      title: conversation.title,
      messages,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
