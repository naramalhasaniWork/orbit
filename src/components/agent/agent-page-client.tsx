"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Send, Trash2, Orbit, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useChat } from "@/hooks/use-chat";
import { AgentMessageRenderer } from "@/components/agent/agent-message-renderer";
import { AgentActivityPanel } from "@/components/agent/agent-activity-panel";
import type { ChatMessage } from "@/hooks/use-chat";

interface AgentPageClientProps {
  projectId: string;
  projectName: string;
  framework: string | null;
}

interface BackgroundOperation {
  id: string;
  type: "indexing" | "planning" | "execution" | "reporting";
  status: "active" | "complete" | "error";
  label: string;
  progress: number;
  detail?: string;
  startedAt: number;
}

export function AgentPageClient({
  projectId,
  projectName,
  framework,
}: AgentPageClientProps) {
  const { messages, isStreaming, sendMessage, clearHistory } = useChat({
    projectId,
  });
  const [input, setInput] = useState("");
  const [showActivity, setShowActivity] = useState(true);
  const [operations, setOperations] = useState<BackgroundOperation[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  const lastMessageContent = messages[messages.length - 1]?.content;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length, lastMessageContent]);

  // Track tool calls as background operations
  useEffect(() => {
    const toolMessages = messages.filter(
      (m) => m.role === "tool_call" || m.role === "tool_result"
    );

    const ops: BackgroundOperation[] = [];
    for (const msg of toolMessages) {
      if (msg.role === "tool_call" && msg.toolName) {
        const opType = toolNameToOpType(msg.toolName);
        if (opType) {
          const hasResult = toolMessages.some(
            (m) => m.role === "tool_result" && m.toolName === msg.toolName
          );
          ops.push({
            id: msg.id,
            type: opType,
            status: hasResult ? "complete" : "active",
            label: toolNameToLabel(msg.toolName),
            progress: hasResult ? 100 : 50,
            startedAt: new Date(msg.createdAt).getTime(),
          });
        }
      }
    }
    setOperations(ops);
  }, [messages]);

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    sendMessage(trimmed);
    setInput("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  }, [input, isStreaming, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = () => {
    const ta = inputRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
    }
  };

  const handleSuggestion = (text: string) => {
    if (isStreaming) return;
    sendMessage(text);
  };

  return (
    <div className="flex h-full -m-6 overflow-hidden">
      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-orbit-accent/[0.1] flex items-center justify-center shadow-[0_0_16px_hsl(var(--orbit-accent)/0.12)]">
              <Orbit className="h-4.5 w-4.5 text-orbit-accent" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground">
                Orbit Agent
              </h1>
              <p className="text-[11px] text-muted-foreground">
                {projectName}
                {framework && (
                  <span className="ml-1.5 text-muted-foreground/60">
                    {framework}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={clearHistory}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </button>
            )}
            <button
              onClick={() => setShowActivity((p) => !p)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors",
                showActivity
                  ? "text-orbit-accent bg-orbit-accent/[0.08]"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]"
              )}
            >
              Activity
              <ChevronRight
                className={cn(
                  "h-3 w-3 transition-transform",
                  showActivity && "rotate-180"
                )}
              />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-6 py-6 space-y-5"
        >
          <AgentMessageRenderer
            messages={messages}
            isStreaming={isStreaming}
          />

          {/* Suggestion chips when empty */}
          {messages.length === 0 && (
            <div className="flex flex-wrap gap-2 justify-center pt-4">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSuggestion(s)}
                  className="text-xs px-3.5 py-2 rounded-full bg-foreground/[0.03] border border-border text-muted-foreground hover:text-foreground hover:border-border hover:bg-foreground/[0.05] transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="shrink-0 px-6 pb-5 pt-2">
          <div
            className={cn(
              "flex items-end gap-3 rounded-xl border px-4 py-3 transition-colors",
              "bg-foreground/[0.02] border-border",
              "focus-within:border-orbit-accent/30 focus-within:bg-foreground/[0.03]"
            )}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              placeholder="Ask Orbit anything..."
              disabled={isStreaming}
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-40 max-h-[160px] leading-relaxed"
            />
            <button
              onClick={handleSubmit}
              disabled={isStreaming || !input.trim()}
              className={cn(
                "shrink-0 h-8 w-8 rounded-lg flex items-center justify-center transition-all",
                input.trim() && !isStreaming
                  ? "bg-orbit-accent text-white shadow-[0_0_12px_hsl(var(--orbit-accent)/0.3)] hover:shadow-[0_0_16px_hsl(var(--orbit-accent)/0.4)]"
                  : "bg-foreground/[0.04] text-muted-foreground/30"
              )}
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground/40 text-center mt-2">
            Orbit Agent can make mistakes. Verify important results.
          </p>
        </div>
      </div>

      {/* Activity sidebar */}
      <AnimatePresence>
        {showActivity && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="shrink-0 border-l border-border overflow-hidden"
          >
            <AgentActivityPanel operations={operations} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const SUGGESTIONS = [
  "What's the status of this project?",
  "Run a smoke test",
  "Re-index the repository",
  "Show me the authentication flow",
  "Generate a new test plan",
  "What failed in the last run?",
];

function toolNameToOpType(
  name: string
): "indexing" | "planning" | "execution" | "reporting" | null {
  const map: Record<string, "indexing" | "planning" | "execution" | "reporting"> = {
    index_repository: "indexing",
    generate_test_plan: "planning",
    run_tests: "execution",
    get_test_results: "reporting",
    explain_failure: "reporting",
    get_system_map: "indexing",
  };
  return map[name] ?? null;
}

function toolNameToLabel(name: string): string {
  const map: Record<string, string> = {
    get_project_status: "Fetching project status",
    index_repository: "Indexing repository",
    generate_test_plan: "Generating test plan",
    run_tests: "Running tests",
    get_test_results: "Loading test results",
    get_system_map: "Querying system map",
    explain_failure: "Analyzing failure",
    cancel_run: "Cancelling run",
  };
  return map[name] ?? name;
}
