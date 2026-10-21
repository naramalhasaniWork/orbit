"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { installConsoleBuffer } from "@/lib/bug-reports/console-buffer";
import { useShortcutAction } from "@/components/shortcuts/shortcut-provider";
import { BugReportDialog } from "./bug-report-dialog";
import { SentToast } from "./sent-toast";

interface BugReportContextValue {
  /** Open the dialog; focus returns to `returnFocus` (default: whatever had focus) when it closes. */
  openBugReport: (returnFocus?: HTMLElement | null) => void;
}

const BugReportContext = createContext<BugReportContextValue>({ openBugReport: () => {} });

export function useBugReport(): BugReportContextValue {
  return useContext(BugReportContext);
}

/** "Report a bug" for the dashboard shell: the dialog, the `B` shortcut and the console ring buffer. */
export function BugReportProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => installConsoleBuffer(), []);

  const openBugReport = useCallback((target?: HTMLElement | null) => {
    returnFocus.current = target ?? (document.activeElement as HTMLElement | null);
    setOpen(true);
  }, []);

  useShortcutAction("bug", () => openBugReport());

  const value = useMemo(() => ({ openBugReport }), [openBugReport]);

  return (
    <BugReportContext.Provider value={value}>
      {children}
      <BugReportDialog
        open={open}
        onOpenChange={setOpen}
        returnFocus={returnFocus}
        onSent={() => {
          setOpen(false);
          setSentAt(Date.now());
        }}
      />
      <SentToast sentAt={sentAt} onDone={() => setSentAt(null)} />
    </BugReportContext.Provider>
  );
}
