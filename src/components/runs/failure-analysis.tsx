"use client";

import { useState, useCallback } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FailureAnalysisProps {
  failureExplanation: string | null;
  suggestedFix: string | null;
  /** Before / Action / After evidence, shown between the explanation and the fix. */
  evidence?: React.ReactNode;
  projectId?: string;
  testResultId?: string;
  testCaseName?: string;
  runId?: string;
}

/** The plain-English write-up first, then the evidence, then the suggested fix. */
export function FailureAnalysis({
  failureExplanation,
  suggestedFix,
  evidence,
  projectId,
  testResultId,
  testCaseName,
  runId,
}: FailureAnalysisProps) {
  const [creating, setCreating] = useState(false);
  const [issueUrl, setIssueUrl] = useState<string | null>(null);
  const [issueError, setIssueError] = useState<string | null>(null);

  if (!failureExplanation && !suggestedFix) return null;

  async function handleCreateLinearIssue() {
    if (!projectId || !testResultId || !testCaseName) return;
    setCreating(true);
    setIssueError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/linear-issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testResultId, testCaseName, failureExplanation, suggestedFix, runId }),
      });
      if (res.ok) {
        const json = await res.json();
        setIssueUrl(json.data?.url ?? null);
      } else {
        setIssueError("Couldn't create the Linear issue. Check the Linear connection in Settings.");
      }
    } catch {
      setIssueError("Couldn't reach the server. Try again.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      {failureExplanation && (
        <p className="max-w-[68ch] whitespace-pre-wrap text-pretty text-[14px] leading-relaxed text-foreground">
          {failureExplanation}
        </p>
      )}

      {evidence}

      {suggestedFix && (
        <div className="rounded-lg border border-border bg-muted">
          <div className="flex h-8 items-center justify-between border-b border-border pl-3 pr-1">
            <span className="tm-label text-tm-t3">Suggested fix</span>
            <CopyButton text={suggestedFix} />
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap p-3 font-mono text-[13px] leading-relaxed text-foreground">
            {suggestedFix}
          </pre>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {issueUrl ? (
          <a
            href={issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 text-[13px] text-foreground underline decoration-tm-line-strong underline-offset-4 hover:decoration-foreground"
          >
            <Check aria-hidden="true" className="size-3.5 text-tm-pass" />
            Issue created, view in Linear
          </a>
        ) : projectId && testResultId && testCaseName ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleCreateLinearIssue}
            disabled={creating}
            aria-busy={creating || undefined}
          >
            <ExternalLink aria-hidden="true" />
            {creating ? "Creating issue…" : "Create Linear issue"}
          </Button>
        ) : null}
        {issueError && (
          <span role="alert" className="text-[12px] text-tm-fail">
            {issueError}
          </span>
        )}
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
    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleCopy} aria-label={copied ? "Copied" : "Copy fix"}>
      {copied ? <Check aria-hidden="true" className="text-tm-pass" /> : <Copy aria-hidden="true" />}
    </Button>
  );
}
