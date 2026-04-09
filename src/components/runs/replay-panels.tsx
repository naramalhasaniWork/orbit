"use client";

import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Shared Types                                                       */
/* ------------------------------------------------------------------ */

export interface ReplayStep {
  index: number;
  action: string;
  description: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  screenshotUrl?: string;
  networkRequests?: Array<{
    url: string;
    method: string;
    status: number;
    durationMs: number;
  }>;
  consoleMessages?: Array<{ type: string; text: string }>;
  invariantViolations?: Array<{
    type: string;
    description: string;
    severity: string;
  }>;
}

export type DetailTab = "screenshot" | "network" | "console" | "dom";

export const STATUS_COLORS: Record<ReplayStep["status"], string> = {
  passed: "bg-orbit-pass",
  failed: "bg-orbit-fail",
  skipped: "bg-muted-foreground/40",
};

const STATUS_BADGE: Record<ReplayStep["status"], string> = {
  passed: "bg-orbit-pass/15 text-orbit-pass border-orbit-pass/30",
  failed: "bg-orbit-fail/15 text-orbit-fail border-orbit-fail/30",
  skipped: "bg-muted/50 text-muted-foreground border-white/[0.06]",
};

export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function truncateUrl(url: string, max = 48): string {
  if (url.length <= max) return url;
  return url.slice(0, max - 3) + "...";
}

/* ------------------------------------------------------------------ */
/*  Tab Content Panels                                                 */
/* ------------------------------------------------------------------ */

export function ScreenshotPanel({ url }: { url?: string }) {
  if (!url) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-muted-foreground">
        No screenshot for this step
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-white/[0.06] overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Step screenshot" className="w-full h-auto" />
    </div>
  );
}

export function NetworkPanel({
  requests,
}: {
  requests?: ReplayStep["networkRequests"];
}) {
  if (!requests || requests.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
        No network requests
      </div>
    );
  }
  return (
    <div className="space-y-1 max-h-64 overflow-y-auto">
      {requests.map((req, i) => {
        const statusColor =
          req.status < 400
            ? "text-orbit-pass"
            : req.status < 500
              ? "text-orbit-flaky"
              : "text-orbit-fail";
        return (
          <div
            key={i}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md surface-1 border border-white/[0.04] text-xs"
          >
            <span className={cn("font-mono tabular-nums font-medium", statusColor)}>
              {req.status}
            </span>
            <span className="text-muted-foreground font-medium uppercase shrink-0">
              {req.method}
            </span>
            <span className="text-foreground/80 truncate flex-1 font-mono">
              {truncateUrl(req.url)}
            </span>
            <span className="text-muted-foreground tabular-nums shrink-0">
              {formatMs(req.durationMs)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function ConsolePanel({
  messages,
}: {
  messages?: ReplayStep["consoleMessages"];
}) {
  if (!messages || messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
        No console messages
      </div>
    );
  }
  const typeColor: Record<string, string> = {
    error: "text-orbit-fail",
    warn: "text-orbit-flaky",
    log: "text-muted-foreground",
    info: "text-muted-foreground",
  };
  return (
    <div className="space-y-1 max-h-64 overflow-y-auto font-mono">
      {messages.map((msg, i) => (
        <div
          key={i}
          className={cn(
            "text-xs px-2 py-1 rounded-md surface-1 border border-white/[0.04]",
            typeColor[msg.type] ?? "text-muted-foreground"
          )}
        >
          <span className="opacity-60 mr-2 uppercase text-[10px]">{msg.type}</span>
          {msg.text}
        </div>
      ))}
    </div>
  );
}

export function DomPanel() {
  return (
    <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
      DOM snapshot viewer coming soon
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step Info + Violations                                             */
/* ------------------------------------------------------------------ */

export function StepInfoCard({ step }: { step: ReplayStep }) {
  return (
    <div className="rounded-lg surface-1 border border-white/[0.06] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Step {step.index + 1}
        </span>
        <span
          className={cn(
            "text-[10px] px-1.5 py-0.5 rounded-md border font-medium",
            STATUS_BADGE[step.status]
          )}
        >
          {step.status}
        </span>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{step.action}</p>
        <p className="text-xs text-muted-foreground">{step.description}</p>
      </div>
      <div className="text-xs text-muted-foreground tabular-nums">
        Duration: {formatMs(step.durationMs)}
      </div>
    </div>
  );
}

export function ViolationsCard({
  violations,
}: {
  violations: NonNullable<ReplayStep["invariantViolations"]>;
}) {
  if (violations.length === 0) return null;
  return (
    <div className="rounded-lg border border-orbit-flaky/30 bg-orbit-flaky/[0.06] p-4 space-y-2">
      <span className="text-[10px] uppercase tracking-wider text-orbit-flaky font-semibold">
        Invariant Violations
      </span>
      <div className="space-y-1.5">
        {violations.map((v, i) => (
          <div key={i} className="text-xs">
            <span className="font-medium text-foreground/90">{v.type}</span>
            <span className="text-muted-foreground mx-1.5">&middot;</span>
            <span className="text-muted-foreground">{v.description}</span>
            <span className="text-muted-foreground mx-1.5">&middot;</span>
            <span className="text-orbit-flaky font-medium">{v.severity}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
