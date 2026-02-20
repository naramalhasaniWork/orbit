"use client";

import { useState } from "react";
import { MessageSquare, X, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChat } from "@/hooks/use-chat";
import { ChatMessages } from "@/components/chat/chat-messages";
import { ChatInput } from "@/components/chat/chat-input";

interface ChatPanelProps {
  projectId: string;
}

export function ChatPanel({ projectId }: ChatPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { messages, isStreaming, sendMessage, clearHistory } = useChat({
    projectId,
  });

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "fixed bottom-5 right-5 z-50 h-11 w-11 rounded-full flex items-center justify-center shadow-lg transition-all duration-200",
          isOpen
            ? "bg-white/[0.08] text-foreground hover:bg-white/[0.12]"
            : "bg-orbit-accent text-white hover:bg-orbit-accent/90 shadow-[0_0_20px_hsl(var(--orbit-accent)/0.3)]"
        )}
      >
        {isOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <MessageSquare className="h-5 w-5" />
        )}
      </button>

      {/* Panel */}
      <div
        className={cn(
          "fixed bottom-20 right-5 z-40 w-[400px] h-[600px] max-h-[calc(100vh-120px)]",
          "surface-1 border border-white/[0.08] rounded-xl shadow-2xl",
          "flex flex-col overflow-hidden",
          "transition-all duration-200 origin-bottom-right",
          isOpen
            ? "scale-100 opacity-100 pointer-events-auto"
            : "scale-95 opacity-0 pointer-events-none"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-orbit-accent/10 flex items-center justify-center">
              <MessageSquare className="h-3.5 w-3.5 text-orbit-accent" />
            </div>
            <span className="text-sm font-medium text-foreground">
              Orbit Agent
            </span>
          </div>
          {messages.length > 0 && (
            <button
              onClick={clearHistory}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
              title="Clear history"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Messages */}
        <ChatMessages messages={messages} isStreaming={isStreaming} />

        {/* Input */}
        <ChatInput onSend={sendMessage} disabled={isStreaming} />
      </div>
    </>
  );
}
