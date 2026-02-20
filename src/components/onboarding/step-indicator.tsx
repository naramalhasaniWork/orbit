"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface StepInfo {
  label: string;
  shortLabel: string;
}

const STEPS: StepInfo[] = [
  { label: "Connect Repo", shortLabel: "Connect" },
  { label: "Indexing", shortLabel: "Index" },
  { label: "System Map", shortLabel: "Map" },
  { label: "Environment", shortLabel: "Env" },
  { label: "Test Plan", shortLabel: "Plan" },
  { label: "Launch", shortLabel: "Launch" },
];

interface StepIndicatorProps {
  currentStep: number;
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center w-full max-w-2xl mx-auto">
      {STEPS.map((step, index) => {
        const stepNumber = index + 1;
        const isComplete = currentStep > stepNumber;
        const isCurrent = currentStep === stepNumber;
        const isPending = currentStep < stepNumber;

        return (
          <div key={step.label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex items-center justify-center h-8 w-8 rounded-full text-xs font-medium transition-all duration-300 border",
                  isComplete && "bg-orbit-accent border-orbit-accent text-white",
                  isCurrent && "border-orbit-accent text-orbit-accent bg-orbit-accent/10",
                  isPending && "border-muted-foreground/30 text-muted-foreground/50 bg-transparent"
                )}
              >
                {isComplete ? <Check className="h-4 w-4" /> : stepNumber}
              </div>
              <span
                className={cn(
                  "text-[11px] font-medium transition-colors duration-300 hidden sm:block",
                  isCurrent && "text-foreground",
                  isComplete && "text-muted-foreground",
                  isPending && "text-muted-foreground/50"
                )}
              >
                {step.label}
              </span>
              <span
                className={cn(
                  "text-[11px] font-medium transition-colors duration-300 sm:hidden",
                  isCurrent && "text-foreground",
                  isComplete && "text-muted-foreground",
                  isPending && "text-muted-foreground/50"
                )}
              >
                {step.shortLabel}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-px mx-3 transition-colors duration-500",
                  currentStep > stepNumber + 1
                    ? "bg-orbit-accent"
                    : currentStep > stepNumber
                      ? "bg-orbit-accent/50"
                      : "bg-muted-foreground/20"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
