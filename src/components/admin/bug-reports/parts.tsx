"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BugReportRow, BugReportStatus } from "@/server/data/bug-report-repo";

/** Compact relative time for dense rows: now, 5m, 3h, 2d, then the date. */
export function shortAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 30 * 86_400) return `${Math.floor(seconds / 86_400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** The same, as a phrase: "just now", "5m ago". */
export function ago(iso: string): string {
  const short = shortAgo(iso);
  return short === "now" ? "just now" : /\d$/.test(short) ? short : `${short} ago`;
}

export function firstLine(message: string): string {
  return message.split("\n").find((l) => l.trim())?.trim() ?? "";
}

export function reporterName(r: BugReportRow["reporter"]): string {
  return r.name?.trim() || r.email;
}

export function Avatar({ reporter, size = 20 }: { reporter: BugReportRow["reporter"]; size?: number }) {
  if (reporter.image) {
    return (
      // Avatars come from the OAuth provider; next/image would need every host allowlisted.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={reporter.image}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        className="shrink-0 rounded-full"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full bg-foreground/[0.08] text-[10px] font-medium text-tm-t2"
      style={{ width: size, height: size }}
    >
      {reporterName(reporter).charAt(0).toUpperCase()}
    </span>
  );
}

/** Status is a glyph and a word, never colour alone. Open carries the view's one accent. */
export function StatusMark({ status, className }: { status: BugReportStatus; className?: string }) {
  return status === "open" ? (
    <span className={cn("inline-flex items-center gap-1.5 text-[12px] text-tm-t1", className)}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-tm-live" />
      Open
    </span>
  ) : (
    <span className={cn("inline-flex items-center gap-1.5 text-[12px] text-tm-t2", className)}>
      <Check aria-hidden="true" className="size-3.5 text-tm-pass" strokeWidth={2} />
      Resolved
    </span>
  );
}
