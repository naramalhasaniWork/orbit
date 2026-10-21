import { apiError, apiSuccess } from "@/lib/utils/api";
import {
  runOrbitAgent,
  saveAssistantResponse,
} from "@/services/orbit-agent/runner";
import type { AgentStreamEvent } from "@/services/orbit-agent/runner";
import { route } from "@/server/http/route";

// ============================================================
// POST /api/projects/[projectId]/chat — Send message, stream response
// ============================================================

export const POST = route(
  { permission: "runs.create" },
  async ({ req: request, params: { projectId }, workspaceId, session, db }) => {
    const project = await db.project(projectId);

    const body = (await request.json()) as { message: string; conversationId?: string };
    const { message } = body;

    if (!message?.trim()) {
      return apiError("Message is required", "VALIDATION_ERROR", 400);
    }

    // Get or create active conversation
    let conversationId = body.conversationId;
    if (!conversationId) {
      const existing = await project.conversation.findFirst({
        where: { projectId, userId: session.user.id, isActive: true },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });
      conversationId = existing?.id ?? undefined;
    }

    if (!conversationId) {
      const conversation = await project.conversation.create({
        data: {
          projectId,
          userId: session.user.id,
          title: message.slice(0, 100),
        },
      });
      conversationId = conversation.id;
    }

    // Save user message
    await project.message.create({
      data: {
        conversationId,
        role: "user",
        content: message,
        metadata: {},
      },
    });

    // Update conversation timestamp
    await project.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // Stream the agent response as SSE
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const fullText: string[] = [];
        const toolCalls: Array<{
          name: string;
          args: Record<string, unknown>;
          result: string;
        }> = [];

        function sendEvent(event: string, data: unknown) {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        }

        try {
          sendEvent("agent:status", { conversationId, status: "streaming" });

          const stream = runOrbitAgent({
            projectId,
            workspaceId,
            userId: session.user.id,
            conversationId,
            userMessage: message,
          });

          for await (const event of stream) {
            switch (event.type) {
              case "text_delta":
                fullText.push(event.text);
                sendEvent("agent:text", { text: event.text });
                break;

              case "tool_call":
                sendEvent("agent:tool_call", {
                  name: event.name,
                  args: event.args,
                });
                break;

              case "tool_result":
                toolCalls.push({
                  name: event.name,
                  args: {},
                  result: event.result,
                });
                sendEvent("agent:tool_result", {
                  name: event.name,
                  result: safeJsonParse(event.result),
                });
                break;

              case "done":
                // Save the full response to the database
                await saveAssistantResponse(
                  conversationId!,
                  fullText.join(""),
                  toolCalls
                );
                sendEvent("agent:done", {
                  conversationId,
                  usage: event.usage,
                });
                break;

              case "error":
                sendEvent("agent:error", { message: event.message });
                break;
            }
          }
        } catch (error) {
          console.error("Chat stream error:", error);
          const errorMsg = sanitizeChatError(error);
          sendEvent("agent:error", { message: errorMsg });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Conversation-Id": conversationId,
      },
    });
  }
);

// ============================================================
// DELETE /api/projects/[projectId]/chat — Clear conversation
// ============================================================

export const DELETE = route(
  { permission: "projects.update" },
  async ({ params: { projectId }, workspaceId, session, db }) => {
    const project = await db.project(projectId);

    await project.conversation.updateMany({
      where: {
        projectId,
        userId: session.user.id,
        isActive: true,
      },
      data: { isActive: false },
    });

    return apiSuccess({ cleared: true });
  }
);

function safeJsonParse(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

/** Sanitize error messages to avoid leaking internal details to clients. */
function sanitizeChatError(error: unknown): string {
  if (!(error instanceof Error)) return "Something went wrong. Please try again.";

  const safePatterns = [
    /rate.*limit/i,
    /token.*budget/i,
    /context.*too.*long/i,
    /model.*not.*available/i,
    /tool.*execution.*failed/i,
  ];

  if (safePatterns.some((p) => p.test(error.message))) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}
