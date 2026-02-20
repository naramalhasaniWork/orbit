"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { AuditLogEntry } from "./audit-types";
import { getActionColor, ACTION_BADGE_CLASSES } from "./audit-types";

interface AuditLogRowProps {
  log: AuditLogEntry;
  showWorkspace?: boolean;
}

export function AuditLogRow({ log, showWorkspace }: AuditLogRowProps) {
  const [expanded, setExpanded] = useState(false);
  const color = getActionColor(log.action);
  const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;

  const timeStr = new Date(log.createdAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return (
    <>
      <tr
        className={cn(
          "border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors cursor-pointer",
          expanded && "bg-white/[0.02]"
        )}
        onClick={() => hasMetadata && setExpanded(!expanded)}
      >
        {/* Time */}
        <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap font-mono">
          {timeStr}
        </td>

        {/* Workspace (admin only) */}
        {showWorkspace && (
          <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
            {log.workspaceName ?? "-"}
          </td>
        )}

        {/* User */}
        <td className="px-3 py-2.5 text-xs text-foreground whitespace-nowrap">
          {log.userName ?? log.userEmail ?? "System"}
        </td>

        {/* Action */}
        <td className="px-3 py-2.5">
          <span
            className={cn(
              "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium",
              ACTION_BADGE_CLASSES[color]
            )}
          >
            {log.action}
          </span>
        </td>

        {/* Resource */}
        <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
          {log.resourceType ? (
            <span>
              <span className="text-foreground/70">{log.resourceType}</span>
              {log.resourceId && (
                <span className="ml-1 font-mono text-[10px]">
                  {log.resourceId.slice(0, 8)}
                </span>
              )}
            </span>
          ) : (
            "-"
          )}
        </td>

        {/* IP */}
        <td className="px-3 py-2.5 text-xs text-muted-foreground font-mono whitespace-nowrap">
          {log.ipAddress ?? "-"}
        </td>

        {/* Expand indicator */}
        <td className="px-2 py-2.5 w-8">
          {hasMetadata && (
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
                expanded && "rotate-90"
              )}
            />
          )}
        </td>
      </tr>

      {/* Expanded metadata */}
      <AnimatePresence>
        {expanded && hasMetadata && (
          <tr>
            <td colSpan={showWorkspace ? 7 : 6} className="p-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-4 py-3 surface-2 border-b border-white/[0.04]">
                  <p className="text-[11px] font-medium text-muted-foreground mb-1.5">
                    Metadata
                  </p>
                  <pre className="text-xs text-foreground/80 font-mono whitespace-pre-wrap break-all leading-relaxed">
                    {JSON.stringify(log.metadata, null, 2)}
                  </pre>
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
}
