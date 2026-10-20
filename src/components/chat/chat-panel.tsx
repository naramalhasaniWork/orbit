"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Trash2, X } from "lucide-react";
import { useChat } from "@/hooks/use-chat";
import { ChatMessages } from "@/components/chat/chat-messages";
import { ChatInput } from "@/components/chat/chat-input";
import { useChatOpen } from "@/components/chat/chat-context";
import { Button } from "@/components/ui/button";

interface ChatPanelProps {
  projectId: string;
}

/**
 * The agent chat as a sheet docked to the right edge, opened from the topbar.
 * Never floats over content while closed; focus is trapped while open and Escape closes it.
 */
export function ChatPanel({ projectId }: ChatPanelProps) {
  const { open, setOpen } = useChatOpen();
  const { messages, isStreaming, sendMessage, clearHistory } = useChat({ projectId });

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-drawer bg-tm-t1/20 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 dark:bg-black/50" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-drawer flex w-full max-w-[420px] flex-col border-l border-border bg-popover pb-[env(safe-area-inset-bottom)] text-popover-foreground shadow-elevated data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right data-[state=open]:duration-open data-[state=closed]:[animation-duration:168ms] data-[state=closed]:ease-in"
        >
          <div className="flex h-[52px] shrink-0 items-center justify-between gap-2 border-b border-border px-4">
            <DialogPrimitive.Title className="text-[14px] font-medium">Agent</DialogPrimitive.Title>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <Button variant="ghost" size="icon" className="size-8" onClick={clearHistory} aria-label="Clear conversation">
                  <Trash2 aria-hidden="true" />
                </Button>
              )}
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" size="icon" className="size-8" aria-label="Close agent">
                  <X aria-hidden="true" />
                </Button>
              </DialogPrimitive.Close>
            </div>
          </div>
          <ChatMessages messages={messages} isStreaming={isStreaming} />
          <ChatInput onSend={sendMessage} disabled={isStreaming} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
