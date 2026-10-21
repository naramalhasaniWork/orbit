import { apiSuccess, apiError } from "@/lib/utils/api";
import { route } from "@/server/http/route";

// ============================================================
// GET /api/projects/[projectId]/chat/history — Get chat messages
// ============================================================

export const GET = route(
  {},
  async ({ req: request, params: { projectId }, workspaceId, session, db }) => {
    const project = await db.project(projectId);

    const limit = Math.min(
      Number(request.nextUrl.searchParams.get("limit")) || 50,
      200
    );

    // Find the active conversation
    const conversation = await project.conversation.findFirst({
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

    const messages = await project.message.findMany({
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
  }
);
