"use client";

import { useState, useCallback, useRef, useEffect } from "react";

// ============================================================
// Types
// ============================================================

interface ToolCallInfo {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool_call" | "tool_result";
  content: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
  createdAt: string;
}

interface UseChatOptions {
  projectId: string;
}

interface UseChatReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  conversationId: string | null;
  sendMessage: (content: string) => void;
  clearHistory: () => void;
}

// ============================================================
// Hook
// ============================================================

export function useChat({ projectId }: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load history on mount and when projectId changes
  useEffect(() => {
    let cancelled = false;

    fetch(`/api/projects/${projectId}/chat/history`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success && data.data.messages.length > 0) {
          setConversationId(data.data.conversationId);
          setMessages(data.data.messages);
        } else {
          setConversationId(null);
          setMessages([]);
        }
      })
      .catch(() => {
        // Silent fail on history load
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Abort in-flight request on unmount to prevent state updates after unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const sendMessage = useCallback(
    (content: string) => {
      if (isStreaming || !content.trim()) return;

      // Add user message optimistically
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);

      // Create assistant placeholder
      const assistantId = crypto.randomUUID();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      const controller = new AbortController();
      abortRef.current = controller;

      fetch(`/api/projects/${projectId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, conversationId }),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Chat failed: ${response.status}`);
          }

          // Read conversation ID from header
          const convId = response.headers.get("X-Conversation-Id");
          if (convId) setConversationId(convId);

          const reader = response.body?.getReader();
          if (!reader) throw new Error("No response body");

          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            let eventType = "";
            for (const line of lines) {
              if (line.startsWith("event: ")) {
                eventType = line.slice(7);
              } else if (line.startsWith("data: ") && eventType) {
                try {
                  const data = JSON.parse(line.slice(6));
                  handleSSEEvent(eventType, data, assistantId);
                } catch {
                  // Skip malformed events
                }
                eventType = "";
              }
            }
          }
        })
        .catch((error) => {
          if (error instanceof Error && error.name === "AbortError") return;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content || "Something went wrong. Please try again." }
                : m
            )
          );
        })
        .finally(() => {
          setIsStreaming(false);
          abortRef.current = null;
        });
    },
    [projectId, conversationId, isStreaming, handleSSEEvent]
  );

  const handleSSEEvent = useCallback(
    (eventType: string, data: Record<string, unknown>, assistantId: string) => {
      switch (eventType) {
        case "agent:text":
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + (data.text as string) }
                : m
            )
          );
          break;

        case "agent:tool_call":
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "tool_call" as const,
              content: `Calling ${data.name as string}...`,
              toolName: data.name as string,
              toolArgs: data.args as Record<string, unknown>,
              createdAt: new Date().toISOString(),
            },
          ]);
          break;

        case "agent:tool_result":
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "tool_result" as const,
              content: "",
              toolName: data.name as string,
              toolResult: data.result,
              createdAt: new Date().toISOString(),
            },
          ]);
          break;

        case "agent:status":
          if (data.conversationId) {
            setConversationId(data.conversationId as string);
          }
          break;

        case "agent:done":
          if (data.conversationId) {
            setConversationId(data.conversationId as string);
          }
          break;

        case "agent:error":
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content:
                      m.content || `Error: ${data.message as string}`,
                  }
                : m
            )
          );
          break;
      }
    },
    []
  );

  const clearHistory = useCallback(() => {
    fetch(`/api/projects/${projectId}/chat`, { method: "DELETE" }).catch(
      () => {}
    );
    setMessages([]);
    setConversationId(null);
  }, [projectId]);

  return { messages, isStreaming, conversationId, sendMessage, clearHistory };
}

export type { ChatMessage, ToolCallInfo, UseChatReturn };
