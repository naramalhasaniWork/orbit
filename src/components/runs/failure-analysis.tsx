"use client";

import { AlertTriangle, Lightbulb, ExternalLink, Copy, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useCallback } from "react";

interface FailureAnalysisProps {
  failureExplanation: string | null;
  suggestedFix: string | null;
  projectId?: string;
  testResultId?: string;
  testCaseName?: string;
  runId?: string;
}

export function FailureAnalysis({
  failureExplanation,
  suggestedFix,
  projectId,
  testResultId,
  testCaseName,
  runId,
}: FailureAnalysisProps) {
  const [creating, setCreating] = useState(false);
  const [issueUrl, setIssueUrl] = useState<string | null>(null);

  if (!failureExplanation && !suggestedFix) return null;

  async function handleCreateLinearIssue() {
    if (!projectId || !testResultId || !testCaseName) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/linear-issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testResultId,
          testCaseName,
          failureExplanation,
          suggestedFix,
          runId,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        setIssueUrl(json.data?.url ?? null);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-3">
      {failureExplanation && (
        <div className="rounded-lg bg-orbit-fail/[0.06] border-l-2 border-orbit-fail/40 py-3 pl-3 pr-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-3.5 w-3.5 text-orbit-fail" />
            <span className="text-xs font-semibold text-orbit-fail uppercase tracking-wider">
              Failure Analysis
            </span>
          </div>
          <p className="text-[13px] text-foreground/80 leading-relaxed whitespace-pre-wrap">
            {failureExplanation}
          </p>
        </div>
      )}

      {suggestedFix && (
        <div className="rounded-lg bg-orbit-pass/[0.06] border-l-2 border-orbit-pass/40 py-3 pl-3 pr-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-3.5 w-3.5 text-orbit-pass" />
              <span className="text-xs font-semibold text-orbit-pass uppercase tracking-wider">
                Suggested Fix
              </span>
            </div>
            <CopyButton text={suggestedFix} />
          </div>
          <pre className="text-[13px] text-foreground/80 leading-relaxed whitespace-pre-wrap font-mono bg-muted/20 rounded-md p-3 overflow-x-auto">
            {suggestedFix}
          </pre>
        </div>
      )}

      <div className="flex items-center gap-2">
        {issueUrl ? (
          <a
            href={issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs h-7 px-2 text-orbit-accent hover:underline"
          >
            <Check className="h-3 w-3" />
            Issue created — view in Linear
          </a>
        ) : projectId && testResultId && testCaseName ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground gap-1.5"
            onClick={handleCreateLinearIssue}
            disabled={creating}
          >
            {creating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ExternalLink className="h-3 w-3" />
            )}
            {creating ? "Creating..." : "Create Linear Issue"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 px-1.5 text-muted-foreground hover:text-foreground"
      onClick={handleCopy}
    >
      {copied ? (
        <Check className="h-3 w-3 text-orbit-pass" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </Button>
  );
}
