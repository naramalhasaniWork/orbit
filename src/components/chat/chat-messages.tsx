"use client";

import { useEffect, useRef } from "react";
import { Bot, User, Wrench } from "lucide-react";
import { Pending } from "@/components/telemetry/pending";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";
import type { ChatMessage } from "@/hooks/use-chat";

interface ChatMessagesProps {
  messages: ChatMessage[];
  isStreaming: boolean;
}

export function ChatMessages({ messages, isStreaming }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  const lastContent = messages[messages.length - 1]?.content;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, lastContent]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <p className="text-pretty text-[13px] text-muted-foreground">
            Ask me about your project, run tests, or explore the system map.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {isStreaming && (
        <div className="pl-9">
          <Pending label="Agent is answering" showLabel />
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "tool_call") {
    return (
      <div className="flex items-center gap-2 pl-9 text-xs text-muted-foreground">
        <Wrench aria-hidden="true" className="h-3 w-3 text-tm-t3" />
        <span className="font-mono">{message.toolName}</span>
      </div>
    );
  }

  if (message.role === "tool_result") {
    return (
      <div className="flex items-center gap-2 pl-9 text-xs text-muted-foreground">
        <span aria-hidden="true" className="font-label text-tm-pass">✓</span>
        <span className="font-mono">{message.toolName} completed</span>
      </div>
    );
  }

  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-2.5", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "shrink-0 h-6 w-6 rounded-full flex items-center justify-center mt-0.5",
          "border border-border bg-muted"
        )}
      >
        {isUser ? (
          <User aria-hidden="true" className="h-3.5 w-3.5 text-tm-t2" />
        ) : (
          <Bot aria-hidden="true" className="h-3.5 w-3.5 text-tm-t2" />
        )}
      </div>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        ) : (
          <MarkdownRenderer content={message.content} />
        )}
      </div>
    </div>
  );
}
