"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { STATUS_TONES, type StatusTone } from "@/lib/status-tone";
import { LiveDot } from "@/components/telemetry/live-dot";
import { StepBar } from "@/components/telemetry/step-bar";
import { formatStepDuration } from "@/lib/runs/steps";

interface LiveListProps {
  title: string;
  /** e.g. "07/19" */
  count: string;
  empty: string;
  /** Changes when the list should follow its newest row. */
  followKey: unknown;
  className?: string;
  children: React.ReactNode;
}

/** Side panel of the live run: instrument header, then rows that follow the newest one. */
export function LiveList({ title, count, empty, followKey, className, children }: LiveListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [followKey]);
  const hasRows = Array.isArray(children) ? children.length > 0 : !!children;

  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden", className)}>
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="tm-label text-tm-t3">{title}</span>
        <span className="tm-num text-[10.5px] text-tm-t2">{count}</span>
      </div>
      <ol aria-live="polite" className="max-h-[480px] flex-1 overflow-y-auto py-1">
        {hasRows ? children : <li className="px-3 py-3 text-[13px] text-tm-t3">{empty}</li>}
        <div ref={bottomRef} />
      </ol>
    </div>
  );
}

interface LiveRowProps {
  index: number;
  tone: StatusTone;
  label: string;
  durationMs?: number | null;
  detail?: string;
}

/** One step or test. The running one has the live dot and a bar that keeps growing. */
export function LiveRow({ index, tone, label, durationMs, detail }: LiveRowProps) {
  const spec = STATUS_TONES[tone];
  const live = tone === "live";
  // When this row was first seen running: the bar grows from there.
  const [seenAt] = useState(() => Date.now());

  return (
    <li className={cn("relative px-3 py-1.5 text-[13px]", live && "bg-accent", tone === "fail" && "bg-tm-fail-bg/60")}>
      {tone === "fail" && (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-px origin-top bg-tm-fail motion-safe:animate-[tm-rule-down_180ms_var(--ease-out)_both]" />
      )}
      <div className="grid grid-cols-[22px_14px_minmax(0,1fr)_auto] items-baseline gap-2">
        <span className={cn("tm-num text-[10.5px]", live ? "text-tm-live-text" : "text-tm-t3")}>
          {String(index + 1).padStart(2, "0")}
        </span>
        {live ? (
          <LiveDot size="sm" className="self-center" />
        ) : (
          <span aria-hidden="true" className={cn("font-label text-xs", spec.text)}>{spec.glyph}</span>
        )}
        <span className={cn("truncate", live ? "font-medium text-foreground" : tone === "untested" ? "text-tm-t3" : "text-tm-t2")}>
          <span className="sr-only">{spec.label}: </span>
          {label}
        </span>
        <span className="tm-num text-[10.5px] text-tm-t3">{durationMs != null ? formatStepDuration(durationMs) : ""}</span>
      </div>
      {live && <StepBar tone="live" startedAt={seenAt} className="mt-1.5" />}
      {detail && <p className="mt-1 break-words pl-12 text-[12px] text-tm-fail">{detail}</p>}
    </li>
  );
}
