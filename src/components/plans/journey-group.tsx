"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { TestCaseCard } from "@/components/plans/test-case-card";
import { type TestCaseData } from "@/components/plans/plan-types";
import { cn } from "@/lib/utils";

interface JourneyGroupProps {
  journey: string;
  testCases: TestCaseData[];
  projectId?: string;
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

export function JourneyGroup({ journey, testCases, projectId }: JourneyGroupProps) {
  const [isOpen, setIsOpen] = useState(true);
  const summary = verdictSummary(testCases);

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 py-2 text-left group w-full"
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-90"
          )}
        />
        <span className="text-xs font-medium text-foreground uppercase tracking-wider">
          {journey}
        </span>
        <span className="text-xs text-muted-foreground">
          ({testCases.length})
        </span>

        <div className="flex-1" />

        <div className="flex items-center gap-2 text-[10px] tabular-nums">
          {summary.pass > 0 && (
            <span className="text-orbit-pass">{summary.pass}P</span>
          )}
          {summary.fail > 0 && (
            <span className="text-orbit-fail">{summary.fail}F</span>
          )}
          {summary.flaky > 0 && (
            <span className="text-orbit-flaky">{summary.flaky}Fl</span>
          )}
          {summary.untested > 0 && (
            <span className="text-muted-foreground">{summary.untested}U</span>
          )}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="ml-5 mt-1 space-y-2 pb-1">
              {testCases.map((tc) => (
                <TestCaseCard key={tc.id} testCase={tc} projectId={projectId} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
