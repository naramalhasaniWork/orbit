"use client";

import { useEffect, useRef } from "react";
import { Bot, User, Wrench, CheckCircle2 } from "lucide-react";
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, lastContent]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <div className="h-10 w-10 rounded-full bg-orbit-accent/10 flex items-center justify-center mx-auto">
            <Bot className="h-5 w-5 text-orbit-accent" />
          </div>
          <p className="text-sm text-muted-foreground">
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
        <div className="flex items-center gap-2 text-xs text-muted-foreground pl-9">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-orbit-accent/60 animate-pulse" />
            <span className="w-1.5 h-1.5 rounded-full bg-orbit-accent/60 animate-pulse [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-orbit-accent/60 animate-pulse [animation-delay:300ms]" />
          </div>
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
        <Wrench className="h-3 w-3 text-orbit-accent/70" />
        <span className="font-mono">{message.toolName}</span>
      </div>
    );
  }

  if (message.role === "tool_result") {
    return (
      <div className="flex items-center gap-2 pl-9 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3 w-3 text-emerald-500/70" />
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
          isUser
            ? "bg-foreground/[0.08]"
            : "bg-orbit-accent/10"
        )}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <Bot className="h-3.5 w-3.5 text-orbit-accent" />
        )}
      </div>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed",
          isUser
            ? "bg-orbit-accent/10 text-foreground"
            : "bg-foreground/[0.04] text-foreground"
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
