"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  type ReplayStep,
  type DetailTab,
  STATUS_COLORS,
  formatMs,
  ScreenshotPanel,
  NetworkPanel,
  ConsolePanel,
  DomPanel,
  StepInfoCard,
  ViolationsCard,
} from "./replay-panels";

export type { ReplayStep };

interface TestReplayProps {
  steps: ReplayStep[];
  testName: string;
}

/* ------------------------------------------------------------------ */
/*  Timeline Bar                                                       */
/* ------------------------------------------------------------------ */

function TimelineBar({
  steps,
  activeStep,
  onStepClick,
}: {
  steps: ReplayStep[];
  activeStep: number;
  onStepClick: (index: number) => void;
}) {
  const totalDuration = steps.reduce((sum, s) => sum + s.durationMs, 0);

  return (
    <div className="flex h-7 w-full rounded-md overflow-hidden border border-white/[0.06]">
      {steps.map((step) => {
        const pct = totalDuration > 0
          ? Math.max((step.durationMs / totalDuration) * 100, 2)
          : 100 / steps.length;
        const isActive = step.index === activeStep;

        return (
          <button
            key={step.index}
            onClick={() => onStepClick(step.index)}
            style={{ flexBasis: `${pct}%` }}
            className={cn(
              "relative min-w-0 transition-all duration-150",
              STATUS_COLORS[step.status],
              isActive
                ? "ring-2 ring-orbit-accent ring-inset brightness-110 z-10"
                : "opacity-70 hover:opacity-100"
            )}
          >
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-white/80 tabular-nums">
              {step.index + 1}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab Config                                                         */
/* ------------------------------------------------------------------ */

const TABS: { key: DetailTab; label: string }[] = [
  { key: "screenshot", label: "Screenshot" },
  { key: "network", label: "Network" },
  { key: "console", label: "Console" },
  { key: "dom", label: "DOM" },
];

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function TestReplay({ steps, testName }: TestReplayProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [activeTab, setActiveTab] = useState<DetailTab>("screenshot");

  const handleStepClick = useCallback((index: number) => {
    setActiveStep(index);
  }, []);

  if (steps.length === 0) return null;

  const current = steps[activeStep];
  const totalDuration = steps.reduce((sum, s) => sum + s.durationMs, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground truncate">{testName}</span>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {steps.length} steps &middot; {formatMs(totalDuration)}
        </span>
      </div>

      {/* Timeline */}
      <TimelineBar steps={steps} activeStep={activeStep} onStepClick={handleStepClick} />

      {/* Detail Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: tabs + content (2/3 width on lg) */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex gap-1 surface-1 rounded-lg p-1 w-fit border border-white/[0.04]">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                  activeTab === tab.key
                    ? "bg-orbit-accent/15 text-orbit-accent"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="surface-2 rounded-lg border border-white/[0.04] p-3">
            {activeTab === "screenshot" && <ScreenshotPanel url={current.screenshotUrl} />}
            {activeTab === "network" && <NetworkPanel requests={current.networkRequests} />}
            {activeTab === "console" && <ConsolePanel messages={current.consoleMessages} />}
            {activeTab === "dom" && <DomPanel />}
          </div>
        </div>

        {/* Right: step info + violations */}
        <div className="space-y-3">
          <StepInfoCard step={current} />
          {current.invariantViolations && current.invariantViolations.length > 0 && (
            <ViolationsCard violations={current.invariantViolations} />
          )}
        </div>
      </div>

      {/* Navigation Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
        <button
          onClick={() => setActiveStep((p) => Math.max(0, p - 1))}
          disabled={activeStep === 0}
          className={cn(
            "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
            activeStep === 0
              ? "text-muted-foreground/40 cursor-not-allowed"
              : "text-foreground hover:bg-white/[0.04]"
          )}
        >
          Previous
        </button>
        <span className="text-xs text-muted-foreground tabular-nums">
          {activeStep + 1} / {steps.length}
        </span>
        <button
          onClick={() => setActiveStep((p) => Math.min(steps.length - 1, p + 1))}
          disabled={activeStep === steps.length - 1}
          className={cn(
            "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
            activeStep === steps.length - 1
              ? "text-muted-foreground/40 cursor-not-allowed"
              : "text-foreground hover:bg-white/[0.04]"
          )}
        >
          Next
        </button>
      </div>
    </div>
  );
}
