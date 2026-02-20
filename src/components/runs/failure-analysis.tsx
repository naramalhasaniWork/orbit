"use client";

import { AlertTriangle, Lightbulb, ExternalLink, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useCallback } from "react";

interface FailureAnalysisProps {
  failureExplanation: string | null;
  suggestedFix: string | null;
}

export function FailureAnalysis({
  failureExplanation,
  suggestedFix,
}: FailureAnalysisProps) {
  if (!failureExplanation && !suggestedFix) return null;

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
          <pre className="text-[13px] text-foreground/80 leading-relaxed whitespace-pre-wrap font-mono bg-white/[0.03] rounded-md p-3 overflow-x-auto">
            {suggestedFix}
          </pre>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground gap-1.5"
          onClick={() => {
            // Placeholder: Create Linear issue
          }}
        >
          <ExternalLink className="h-3 w-3" />
          Create Linear Issue
        </Button>
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
