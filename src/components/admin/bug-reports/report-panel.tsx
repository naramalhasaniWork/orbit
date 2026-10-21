"use client";

import { useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BugReportRow, BugReportStatus } from "@/server/data/bug-report-repo";
import { Avatar, StatusMark, ago, reporterName } from "./parts";

interface ReportPanelProps {
  report: BugReportRow | null;
  onOpenChange: (open: boolean) => void;
  onStatusChange: (id: string, status: BugReportStatus) => Promise<string | null>;
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b border-border px-5 py-4 last:border-b-0">
      <h3 className="tm-label text-tm-t3">{label}</h3>
      {children}
    </section>
  );
}

function ContextList({ report }: { report: BugReportRow }) {
  const { context: c } = report;
  const rows: Array<[string, string | null]> = [
    ["Page", c.path ?? null],
    ["Viewport", c.viewport ? `${c.viewport.width} × ${c.viewport.height}` : null],
    ["Browser", c.userAgent || null],
    ["Workspace", report.workspace ? `${report.workspace.name} · ${report.workspace.id}` : null],
    ["User", report.reporter.id],
    ["Version", c.appVersion ?? null],
  ];
  const errors = c.consoleErrors ?? [];

  return (
    <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 text-[13px]">
      {rows.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-tm-t3">{key}</dt>
          <dd className="min-w-0 break-words text-tm-t1">{value ?? <span className="text-tm-t3">—</span>}</dd>
        </div>
      ))}
      <dt className="text-tm-t3">Console</dt>
      <dd className="min-w-0">
        {errors.length === 0 ? (
          <span className="text-tm-t3">No errors captured</span>
        ) : (
          <ol className="flex flex-col divide-y divide-border rounded-md border border-border bg-tm-sunken">
            {errors.map((line, i) => (
              <li key={i} className="tm-num whitespace-pre-wrap break-all px-2.5 py-1.5 text-[11px] leading-relaxed text-tm-t2">
                {line}
              </li>
            ))}
          </ol>
        )}
      </dd>
    </dl>
  );
}

/** The report as a sheet from the right edge: focus trapped, Escape closes, focus returns to the row. */
export function ReportPanel({ report: current, onOpenChange, onStatusChange }: ReportPanelProps) {
  // Keep showing the last report while the sheet animates out.
  const last = useRef<BugReportRow | null>(null);
  if (current) last.current = current;
  const report = current ?? last.current;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(r: BugReportRow) {
    setBusy(true);
    setError(null);
    setError(await onStatusChange(r.id, r.status === "open" ? "resolved" : "open"));
    setBusy(false);
  }

  return (
    <DialogPrimitive.Root open={current !== null} onOpenChange={(open) => { if (!open) setError(null); onOpenChange(open); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-drawer bg-tm-t1/20 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 dark:bg-black/50" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-drawer flex w-full max-w-[480px] flex-col border-l border-border bg-popover pb-[env(safe-area-inset-bottom)] text-popover-foreground shadow-elevated data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right data-[state=open]:duration-open data-[state=closed]:[animation-duration:168ms] data-[state=closed]:ease-in"
        >
          {report && (
            <>
              <div className="flex h-[52px] shrink-0 items-center justify-between gap-2 border-b border-border px-5">
                <div className="flex items-center gap-3">
                  <DialogPrimitive.Title className="text-[14px] font-medium">Bug report</DialogPrimitive.Title>
                  <StatusMark status={report.status} />
                </div>
                <DialogPrimitive.Close asChild>
                  <Button variant="ghost" size="icon" className="-mr-2 size-8" aria-label="Close report">
                    <X aria-hidden="true" />
                  </Button>
                </DialogPrimitive.Close>
              </div>

              <div className="flex-1 overflow-y-auto">
                <Section label="Reporter">
                  <div className="flex items-center gap-2.5">
                    <Avatar reporter={report.reporter} size={28} />
                    <div className="min-w-0 text-[13px]">
                      <p className="truncate font-medium">{reporterName(report.reporter)}</p>
                      <p className="truncate text-tm-t2">
                        {report.reporter.email} ·{" "}
                        <time dateTime={report.createdAt} title={new Date(report.createdAt).toLocaleString()} className="tm-num">
                          {ago(report.createdAt)}
                        </time>
                      </p>
                    </div>
                  </div>
                </Section>

                <Section label="Message">
                  <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-pretty">{report.message}</p>
                </Section>

                {report.hasScreenshot && (
                  <Section label="Screenshot">
                    <a
                      href={`/api/admin/bug-reports/${report.id}/screenshot`}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-md border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {/* Served by an authenticated route; next/image's optimiser would fetch it without the session. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/admin/bug-reports/${report.id}/screenshot`}
                        alt="Screenshot attached to the report (opens full size)"
                        className="block max-h-[360px] w-full bg-tm-sunken object-contain"
                      />
                    </a>
                  </Section>
                )}

                <Section label="Context">
                  <ContextList report={report} />
                </Section>
              </div>

              <div className="flex shrink-0 flex-col gap-2 border-t border-border px-5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-tm-t3">
                    {report.status === "resolved" && report.resolvedAt ? (
                      <>Resolved <span className="tm-num">{ago(report.resolvedAt)}</span></>
                    ) : (
                      "Open until someone marks it resolved"
                    )}
                  </p>
                  <Button
                    variant={report.status === "open" ? "default" : "outline"}
                    disabled={busy}
                    aria-busy={busy}
                    onClick={() => toggle(report)}
                  >
                    {report.status === "open" ? "Mark resolved" : "Reopen"}
                  </Button>
                </div>
                {error && (
                  <p role="alert" className="text-right text-xs text-tm-fail">
                    {error}
                  </p>
                )}
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
