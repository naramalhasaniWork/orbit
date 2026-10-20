"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";

function StatCardSkeleton() {
  return (
    <div className="rounded-xl surface-1 border border-border p-4">
      <div className="h-3 w-16 rounded-lg surface-1 mb-3" />
      <div className="h-7 w-12 rounded-lg surface-1" />
    </div>
  );
}

function TimelineItemSkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="h-2.5 w-2.5 rounded-full surface-1 mt-1" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-40 rounded-lg surface-1" />
        <div className="h-3 w-64 rounded-lg surface-1" />
      </div>
      <div className="h-5 w-14 rounded-lg surface-1" />
    </div>
  );
}

export function RunDetailSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header skeleton */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/runs"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-5 w-28 rounded-lg surface-1" />
            <div className="h-4 w-16 rounded-lg surface-1" />
          </div>
          <div className="flex items-center gap-4">
            <div className="h-3 w-12 rounded-lg surface-1" />
            <div className="h-3 w-14 rounded-lg surface-1" />
            <div className="h-3 w-20 rounded-lg surface-1" />
          </div>
        </div>
      </div>

      {/* Stat cards skeleton */}
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>

      {/* Progress bar skeleton */}
      <div className="h-1.5 rounded-full surface-1" />

      {/* Tab bar skeleton */}
      <div className="space-y-4">
        <div className="flex gap-1 surface-1 rounded-lg p-1 w-fit">
          <div className="h-7 w-20 rounded-md surface-3" />
          <div className="h-7 w-20 rounded-md surface-1" />
        </div>

        {/* Timeline skeleton */}
        <div className="rounded-xl surface-1 border border-border overflow-hidden divide-y divide-border/50">
          {Array.from({ length: 5 }).map((_, i) => (
            <TimelineItemSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
