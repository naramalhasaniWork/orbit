"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronDown,
  FileCode,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface AuditIssue {
  id: string;
  severity: string;
  category: string;
  file: string;
  line: number;
  title: string;
  description: string;
  suggestion: string;
  codeSnippet: string;
}

interface IssueListProps {
  issues: AuditIssue[];
}

const SEVERITY_CONFIG: Record<
  string,
  { color: string; bg: string; icon: LucideIcon; order: number }
> = {
  critical: {
    color: "text-red-400",
    bg: "bg-red-400/10 border-red-400/20",
    icon: AlertTriangle,
    order: 0,
  },
  high: {
    color: "text-orange-400",
    bg: "bg-orange-400/10 border-orange-400/20",
    icon: AlertTriangle,
    order: 1,
  },
  medium: {
    color: "text-amber-400",
    bg: "bg-amber-400/10 border-amber-400/20",
    icon: AlertCircle,
    order: 2,
  },
  low: {
    color: "text-blue-400",
    bg: "bg-blue-400/10 border-blue-400/20",
    icon: Info,
    order: 3,
  },
  info: {
    color: "text-slate-400",
    bg: "bg-slate-400/10 border-slate-400/20",
    icon: Info,
    order: 4,
  },
};

function IssueCard({ issue }: { issue: AuditIssue }) {
  const [expanded, setExpanded] = useState(false);
  const config = SEVERITY_CONFIG[issue.severity] ?? SEVERITY_CONFIG.info;
  const Icon = config.icon;

  return (
    <div className={cn("rounded-lg border", config.bg)}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-start gap-3 w-full p-3 text-left"
      >
        <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", config.color)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-xs font-medium uppercase", config.color)}>
              {issue.severity}
            </span>
            <span className="text-xs text-muted-foreground">{issue.category}</span>
          </div>
          <p className="text-sm font-medium text-foreground mt-0.5">{issue.title}</p>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
            <FileCode className="h-3 w-3" />
            <span className="truncate">{issue.file}</span>
            <span>:{issue.line}</span>
          </div>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200",
            expanded && "rotate-180"
          )}
        />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-3 border-t border-white/[0.04] pt-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                <p className="text-sm text-foreground/80">{issue.description}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Code</p>
                <pre className="text-xs text-foreground/70 bg-black/30 rounded p-2 overflow-x-auto">
                  <code>{issue.codeSnippet}</code>
                </pre>
              </div>
              <div>
                <p className="text-xs font-medium text-emerald-400 mb-1">Suggestion</p>
                <p className="text-sm text-foreground/80">{issue.suggestion}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function IssueList({ issues }: IssueListProps) {
  // Group by severity, sorted by severity order
  const sorted = [...issues].sort((a, b) => {
    const orderA = SEVERITY_CONFIG[a.severity]?.order ?? 5;
    const orderB = SEVERITY_CONFIG[b.severity]?.order ?? 5;
    return orderA - orderB;
  });

  if (sorted.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">No issues found. Your code looks great!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.map((issue) => (
        <IssueCard key={issue.id} issue={issue} />
      ))}
    </div>
  );
}
