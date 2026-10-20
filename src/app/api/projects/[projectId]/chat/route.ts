import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiError,
  apiSuccess,
  handleApiError,
} from "@/lib/utils/api";
import {
  runOrbitAgent,
  saveAssistantResponse,
} from "@/services/orbit-agent/runner";
import type { AgentStreamEvent } from "@/services/orbit-agent/runner";
import { requirePermission } from "@/lib/auth/rbac";

// ============================================================
// POST /api/projects/[projectId]/chat — Send message, stream response
// ============================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { session, workspaceId } = await requireWorkspace();
    await requirePermission(workspaceId, "runs.create");
    const { projectId } = await params;

    // Verify project belongs to workspace
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const body = (await request.json()) as { message: string; conversationId?: string };
    const { message } = body;

    if (!message?.trim()) {
      return apiError("Message is required", "VALIDATION_ERROR", 400);
    }

    // Get or create active conversation
    let conversationId = body.conversationId;
    if (!conversationId) {
      const existing = await prisma.conversation.findFirst({
        where: { projectId, userId: session.user.id, isActive: true },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });
      conversationId = existing?.id ?? undefined;
    }

    if (!conversationId) {
      const conversation = await prisma.conversation.create({
        data: {
          projectId,
          userId: session.user.id,
          title: message.slice(0, 100),
        },
      });
      conversationId = conversation.id;
    }

    // Save user message
    await prisma.message.create({
      data: {
        conversationId,
        role: "user",
        content: message,
        metadata: {},
      },
    });

    // Update conversation timestamp
    await prisma.conversation.update({
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
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================
// DELETE /api/projects/[projectId]/chat — Clear conversation
// ============================================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { session, workspaceId } = await requireWorkspace();
    await requirePermission(workspaceId, "projects.update");
    const { projectId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    await prisma.conversation.updateMany({
      where: {
        projectId,
        userId: session.user.id,
        isActive: true,
      },
      data: { isActive: false },
    });

    return apiSuccess({ cleared: true });
  } catch (error) {
    return handleApiError(error);
  }
}

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
