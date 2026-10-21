"use client";

import { useId, useRef, useState, type MutableRefObject } from "react";
import { ImagePlus, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { recentConsoleErrors } from "@/lib/bug-reports/console-buffer";
import { sanitizeClientContext } from "@/lib/bug-reports/context";
import { SCREENSHOT_ACCEPT, SCREENSHOT_MAX_BYTES, isScreenshotType } from "@/lib/bug-reports/screenshot";

const MAX_MESSAGE = 5000;

interface BugReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocus: MutableRefObject<HTMLElement | null>;
  onSent: () => void;
}

function screenshotProblem(file: File): string | null {
  if (!isScreenshotType(file.type)) return "Attach a PNG, JPEG or WebP image.";
  if (file.size > SCREENSHOT_MAX_BYTES) return "That image is over 5 MB.";
  return null;
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** What the page can tell us without reading anything the user typed, or any cookie or storage. */
function captureContext() {
  return sanitizeClientContext({
    path: window.location.pathname,
    userAgent: navigator.userAgent,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    consoleErrors: recentConsoleErrors(),
  });
}

export function BugReportDialog({ open, onOpenChange, returnFocus, onSent }: BugReportDialogProps) {
  const ids = { message: useId(), messageError: useId(), fileError: useId(), context: useId() };
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  function reset() {
    setMessage("");
    setFile(null);
    setMessageError(null);
    setFileError(null);
    setSubmitError(null);
  }

  function attach(next: File | null) {
    const problem = next ? screenshotProblem(next) : null;
    setFileError(problem);
    setFile(problem ? null : next);
  }

  async function send() {
    if (sending) return;
    if (!message.trim()) return setMessageError("Describe what went wrong.");
    setSending(true);
    setSubmitError(null);
    const body = new FormData();
    body.append("message", message);
    body.append("context", JSON.stringify(captureContext()));
    if (file) body.append("screenshot", file);
    try {
      const res = await fetch("/api/bug-reports", { method: "POST", body });
      const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) throw new Error(json?.error?.message ?? "Couldn't send the report.");
      reset();
      onSent();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Couldn't send the report.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !sending) setSubmitError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent
        aria-describedby={ids.context}
        className="gap-0 p-0 sm:max-w-[480px]"
        onCloseAutoFocus={(e) => {
          if (!returnFocus.current?.isConnected) return;
          e.preventDefault();
          returnFocus.current.focus();
        }}
      >
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle>Report a bug</DialogTitle>
        </DialogHeader>

        <form
          noValidate
          className="flex flex-col gap-4 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <div className="flex flex-col gap-2">
            <label htmlFor={ids.message} className="text-[13px] font-medium">
              What went wrong?
            </label>
            <Textarea
              id={ids.message}
              value={message}
              maxLength={MAX_MESSAGE}
              rows={5}
              placeholder="What you did, what you expected, what happened instead."
              aria-invalid={messageError ? true : undefined}
              aria-describedby={messageError ? ids.messageError : undefined}
              className="min-h-[120px] resize-y"
              onChange={(e) => {
                setMessage(e.target.value);
                if (messageError) setMessageError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void send();
                }
              }}
              onPaste={(e) => {
                const image = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
                if (image) {
                  e.preventDefault();
                  attach(image);
                }
              }}
            />
            {messageError && (
              <p id={ids.messageError} role="alert" className="text-xs text-tm-fail">
                {messageError}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <input
              ref={fileInput}
              type="file"
              accept={SCREENSHOT_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                attach(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            {file ? (
              <div className="flex h-9 items-center gap-2 rounded-md border border-border px-2.5 text-[13px]">
                <ImagePlus aria-hidden="true" className="size-4 shrink-0 text-tm-t3" />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="tm-num shrink-0 text-[11px] text-tm-t3">{formatSize(file.size)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => attach(null)}
                  className="-mr-1 flex size-7 shrink-0 items-center justify-center rounded text-tm-t2 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                aria-describedby={fileError ? ids.fileError : undefined}
                onClick={() => fileInput.current?.click()}
              >
                <ImagePlus aria-hidden="true" />
                Attach screenshot
                <span className="font-normal text-tm-t3">optional</span>
              </Button>
            )}
            {fileError && (
              <p id={ids.fileError} role="alert" className="text-xs text-tm-fail">
                {fileError}
              </p>
            )}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p id={ids.context} className="text-xs text-pretty text-tm-t3">
              We&apos;ll include: page, browser, workspace, recent errors
            </p>
            <Button type="submit" disabled={sending} aria-busy={sending} className="shrink-0">
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
          {submitError && (
            <p role="alert" className="-mt-2 text-xs text-tm-fail sm:text-right">
              {submitError}
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
