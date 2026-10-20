"use client";

import { memo } from "react";
import { Bot, User, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { AgentToolCard } from "@/components/agent/agent-tool-card";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";
import type { ChatMessage } from "@/hooks/use-chat";

interface AgentMessageRendererProps {
  messages: ChatMessage[];
  isStreaming: boolean;
}

export function AgentMessageRenderer({
  messages,
  isStreaming,
}: AgentMessageRendererProps) {
  if (messages.length === 0) {
    return <EmptyState />;
  }

  // Group tool_call + tool_result pairs into the preceding assistant message
  const rendered: React.ReactNode[] = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];

    if (msg.role === "user") {
      rendered.push(<UserBubble key={msg.id} content={msg.content} />);
      i++;
    } else if (msg.role === "assistant") {
      // Collect any tool calls that follow
      const toolPairs: Array<{
        name: string;
        args: Record<string, unknown>;
        result?: unknown;
        status: "complete" | "running";
      }> = [];

      let j = i + 1;
      while (j < messages.length) {
        if (messages[j].role === "tool_call") {
          const callMsg = messages[j];
          const resultMsg = messages[j + 1]?.role === "tool_result" ? messages[j + 1] : undefined;
          toolPairs.push({
            name: callMsg.toolName ?? "unknown",
            args: callMsg.toolArgs ?? {},
            result: resultMsg?.toolResult,
            status: resultMsg ? "complete" : "running",
          });
          j += resultMsg ? 2 : 1;
        } else {
          break;
        }
      }

      rendered.push(
        <AssistantBubble
          key={msg.id}
          content={msg.content}
          tools={toolPairs}
          isLast={j >= messages.length}
          isStreaming={isStreaming && j >= messages.length}
        />
      );
      i = j;
    } else if (msg.role === "tool_call") {
      // Orphaned tool call (no preceding assistant message)
      const resultMsg = messages[i + 1]?.role === "tool_result" ? messages[i + 1] : undefined;
      rendered.push(
        <div key={msg.id} className="pl-11">
          <AgentToolCard
            name={msg.toolName ?? "unknown"}
            args={msg.toolArgs ?? {}}
            result={resultMsg?.toolResult}
            status={resultMsg ? "complete" : "running"}
          />
        </div>
      );
      i += resultMsg ? 2 : 1;
    } else {
      i++;
    }
  }

  return <>{rendered}</>;
}

const UserBubble = memo(function UserBubble({ content }: { content: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-start gap-3 justify-end"
    >
      <div className="max-w-[70%] rounded-2xl rounded-tr-md px-4 py-3 bg-orbit-accent/[0.12] border border-orbit-accent/[0.08]">
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {content}
        </p>
      </div>
      <div className="shrink-0 h-8 w-8 rounded-full bg-foreground/[0.06] flex items-center justify-center mt-0.5">
        <User className="h-4 w-4 text-muted-foreground" />
      </div>
    </motion.div>
  );
});

const AssistantBubble = memo(function AssistantBubble({
  content,
  tools,
  isLast,
  isStreaming,
}: {
  content: string;
  tools: Array<{
    name: string;
    args: Record<string, unknown>;
    result?: unknown;
    status: "complete" | "running";
  }>;
  isLast: boolean;
  isStreaming: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-start gap-3"
    >
      <div className="shrink-0 h-8 w-8 rounded-full bg-orbit-accent/[0.1] flex items-center justify-center mt-0.5 shadow-[0_0_12px_hsl(var(--orbit-accent)/0.1)]">
        <Bot className="h-4 w-4 text-orbit-accent" />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        {/* Tool cards */}
        {tools.map((tool, idx) => (
          <AgentToolCard
            key={`${tool.name}-${idx}`}
            name={tool.name}
            args={tool.args}
            result={tool.result}
            status={tool.status}
          />
        ))}

        {/* Text content with markdown rendering */}
        {content && (
          <div className="rounded-2xl rounded-tl-md px-4 py-3 bg-foreground/[0.03] border border-border">
            <MarkdownRenderer content={content} />
            {isLast && isStreaming && (
              <span className="inline-block w-[6px] h-[14px] bg-orbit-accent/70 ml-0.5 animate-pulse rounded-sm" />
            )}
          </div>
        )}

        {/* Streaming indicator when no content yet */}
        {!content && isLast && isStreaming && tools.length === 0 && (
          <div className="flex items-center gap-2 px-4 py-3">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-orbit-accent/60 animate-pulse" />
              <span className="w-1.5 h-1.5 rounded-full bg-orbit-accent/60 animate-pulse [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-orbit-accent/60 animate-pulse [animation-delay:300ms]" />
            </div>
            <span className="text-xs text-muted-foreground">Thinking...</span>
          </div>
        )}
      </div>
    </motion.div>
  );
});

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="text-center space-y-4 max-w-md"
      >
        <div className="h-16 w-16 rounded-2xl bg-orbit-accent/[0.08] border border-orbit-accent/[0.08] flex items-center justify-center mx-auto shadow-[0_0_30px_hsl(var(--orbit-accent)/0.08)]">
          <Sparkles className="h-7 w-7 text-orbit-accent" />
        </div>
        <div className="space-y-2">
          <h3 className="text-base font-medium text-foreground">
            Orbit Agent
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Ask me to index your repo, generate test plans, run tests, or explain failures.
            I&apos;ll handle everything.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
