"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusDot } from "@/components/shared/status-dot";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import {
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  UserPlus,
  GitBranch,
  Zap,
  Loader2,
} from "lucide-react";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type EventType =
  | "run_started"
  | "run_completed"
  | "test_failed"
  | "test_healed"
  | "issue_created"
  | "member_joined"
  | "deploy_detected"
  | "plan_generated";

interface ActivityEvent {
  id: string;
  type: EventType;
  title: string;
  description?: string;
  timestamp: Date;
  metadata?: Record<string, string>;
}

interface ActivityFeedProps {
  events: ActivityEvent[];
  hasMore?: boolean;
  onLoadMore?: () => void;
  loading?: boolean;
  className?: string;
}

// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------

const eventConfig: Record<
  EventType,
  {
    icon: React.ElementType;
    color: string;
    dotStatus: "pass" | "fail" | "flaky" | "running" | "untested";
  }
> = {
  run_started: {
    icon: Play,
    color: "text-orbit-accent",
    dotStatus: "running",
  },
  run_completed: {
    icon: CheckCircle2,
    color: "text-orbit-pass",
    dotStatus: "pass",
  },
  test_failed: {
    icon: XCircle,
    color: "text-orbit-fail",
    dotStatus: "fail",
  },
  test_healed: {
    icon: Zap,
    color: "text-orbit-pass",
    dotStatus: "pass",
  },
  issue_created: {
    icon: AlertTriangle,
    color: "text-orbit-flaky",
    dotStatus: "flaky",
  },
  member_joined: {
    icon: UserPlus,
    color: "text-muted-foreground",
    dotStatus: "untested",
  },
  deploy_detected: {
    icon: GitBranch,
    color: "text-orbit-accent",
    dotStatus: "running",
  },
  plan_generated: {
    icon: Zap,
    color: "text-orbit-accent",
    dotStatus: "running",
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
};

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

export function ActivityFeed({
  events,
  hasMore,
  onLoadMore,
  loading,
  className,
}: ActivityFeedProps) {
  const [filter, setFilter] = useState<EventType | null>(null);

  const filteredEvents = filter
    ? events.filter((e) => e.type === filter)
    : events;

  const handleLoadMore = useCallback(() => {
    if (onLoadMore && !loading) onLoadMore();
  }, [onLoadMore, loading]);

  return (
    <div
      className={cn(
        "rounded-xl surface-1 border border-border h-full flex flex-col",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <h2 className="text-[13px] font-medium text-foreground">Activity</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilter(null)}
            className={cn(
              "px-2 py-0.5 rounded text-[10px] transition-colors",
              !filter
                ? "bg-orbit-accent/10 text-orbit-accent"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            All
          </button>
          <button
            onClick={() => setFilter(filter === "test_failed" ? null : "test_failed")}
            className={cn(
              "px-2 py-0.5 rounded text-[10px] transition-colors",
              filter === "test_failed"
                ? "bg-orbit-fail/10 text-orbit-fail"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Failures
          </button>
          <button
            onClick={() => setFilter(filter === "run_completed" ? null : "run_completed")}
            className={cn(
              "px-2 py-0.5 rounded text-[10px] transition-colors",
              filter === "run_completed"
                ? "bg-orbit-pass/10 text-orbit-pass"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Runs
          </button>
        </div>
      </div>

      {/* Event list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-4 pb-4">
          {filteredEvents.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
              <Zap className="h-4 w-4 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">No activity yet</p>
              <p className="text-[11px] text-muted-foreground/70 max-w-[220px]">
                Runs, failures, and fixes will appear here as your tests
                execute.
              </p>
            </div>
          )}
          <AnimatePresence mode="popLayout">
            {filteredEvents.map((event) => {
              const config = eventConfig[event.type];
              const Icon = config.icon;

              return (
                <motion.div
                  key={event.id}
                  variants={itemVariants}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  layout
                  className="flex gap-3 py-2.5 border-b border-border/50 last:border-0"
                >
                  {/* Timeline line + icon */}
                  <div className="flex flex-col items-center pt-0.5">
                    <div
                      className={cn(
                        "flex items-center justify-center h-6 w-6 rounded-md",
                        "bg-foreground/[0.06]"
                      )}
                    >
                      <Icon className={cn("h-3.5 w-3.5", config.color)} />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-sm text-foreground leading-snug">
                      {event.title}
                    </p>
                    {event.description && (
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {event.description}
                      </p>
                    )}
                    {event.metadata && (
                      <div className="flex items-center gap-2 mt-1">
                        {Object.entries(event.metadata).map(([key, val]) => (
                          <span
                            key={key}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-foreground/[0.06] text-muted-foreground"
                          >
                            {key}: {val}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Timestamp */}
                  <span className="text-[11px] text-muted-foreground shrink-0 pt-0.5 tabular-nums">
                    {formatDistanceToNow(new Date(event.timestamp), {
                      addSuffix: true,
                    })}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Load more */}
          {hasMore && (
            <div className="pt-3 flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLoadMore}
                disabled={loading}
                className="text-xs text-muted-foreground"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Load more"
                )}
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
