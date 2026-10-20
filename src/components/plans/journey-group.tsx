"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { tween } from "@/lib/motion";
import { ChevronRight } from "lucide-react";
import { TestCaseCard } from "@/components/plans/test-case-card";
import { type TestCaseData } from "@/components/plans/plan-types";
import { cn } from "@/lib/utils";

interface JourneyGroupProps {
  journey: string;
  testCases: TestCaseData[];
  projectId?: string;
  selection?: {
    selected: ReadonlySet<string>;
    onToggle: (id: string, shift: boolean) => void;
  };
}

function verdictSummary(testCases: TestCaseData[]) {
  let pass = 0, fail = 0, flaky = 0, untested = 0;
  for (const tc of testCases) {
    if (tc.lastVerdict === "pass" || tc.lastVerdict === "healed") pass++;
    else if (tc.lastVerdict === "fail") fail++;
    else if (tc.lastVerdict === "flaky") flaky++;
    else untested++;
  }
  return { pass, fail, flaky, untested };
}

export function JourneyGroup({ journey, testCases, projectId, selection }: JourneyGroupProps) {
  const [isOpen, setIsOpen] = useState(true);
  const summary = verdictSummary(testCases);

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="group flex h-9 w-full items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-90"
          )}
        />
        <span className=" text-foreground tm-label">
          {journey}
        </span>
        <span className="tm-num text-[10.5px] text-tm-t3">{testCases.length}</span>

        <div className="flex-1" />

        <span className="tm-num flex items-center gap-2.5 text-[10.5px]">
          {summary.pass > 0 && <span className="text-tm-pass"><span aria-hidden="true">✓</span>{summary.pass}<span className="sr-only"> passing</span></span>}
          {summary.fail > 0 && <span className="text-tm-fail"><span aria-hidden="true">✕</span>{summary.fail}<span className="sr-only"> failing</span></span>}
          {summary.flaky > 0 && <span className="text-tm-flaky"><span aria-hidden="true">◐</span>{summary.flaky}<span className="sr-only"> flaky</span></span>}
          {summary.untested > 0 && <span className="text-tm-t3"><span aria-hidden="true">○</span>{summary.untested}<span className="sr-only"> untested</span></span>}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={tween.open}
            className="overflow-hidden"
          >
            <div className="mb-2 ml-5 overflow-hidden rounded-lg border border-border bg-card">
              {testCases.map((tc) => (
                <TestCaseCard
                  key={tc.id}
                  testCase={tc}
                  projectId={projectId}
                  selected={selection?.selected.has(tc.id)}
                  onToggleSelect={selection && ((shift) => selection.onToggle(tc.id, shift))}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
