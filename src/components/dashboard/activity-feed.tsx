"use client";

import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ActivityRow } from "@/lib/dashboard/launchpad-shape";

interface ActivityFeedProps {
  events: ActivityRow[];
  hasMore?: boolean;
  onLoadMore?: () => void;
  loading?: boolean;
  className?: string;
}

const ROW = "grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-border py-2.5 text-[13px]";

/** Who did what, newest first: the person's avatar, a sentence, and how long ago. Static; no entrance motion. */
export function ActivityFeed({ events, hasMore, onLoadMore, loading, className }: ActivityFeedProps) {
  return (
    <section aria-labelledby="activity" className={cn("flex flex-col px-5 py-5", className)}>
      <h2 id="activity" className="mb-2 text-[14px] font-medium">Team activity</h2>
      {events.length === 0 ? (
        <p className="border-t border-border py-3 text-[13px] text-tm-t3">Runs and plan approvals by your team appear here.</p>
      ) : (
        <ul>
          {events.map((e) => {
            const body = (
              <>
                <Avatar name={e.who?.name} email={e.who?.email} image={e.who?.image} size="sm" decorative />
                <span className="truncate">
                  <span className="font-medium">{e.who?.name ?? "Orbit"}</span> <span className="text-tm-t2">{e.what}</span>
                </span>
                <span className="tm-num text-[10.5px] text-tm-t3">{formatDistanceToNowStrict(new Date(e.at))}</span>
              </>
            );
            return (
              <li key={e.id}>
                {e.href ? (
                  <Link
                    href={e.href}
                    className={cn(ROW, "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring")}
                  >
                    {body}
                  </Link>
                ) : (
                  <div className={ROW}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {hasMore && (
        <Button variant="ghost" size="sm" onClick={onLoadMore} disabled={loading} aria-busy={loading} className="mt-2 self-start text-xs text-tm-t2">
          {loading ? "Loading…" : "Load more"}
        </Button>
      )}
    </section>
  );
}
