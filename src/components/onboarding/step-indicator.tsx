"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
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

        return (
          <div key={step.label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <motion.div
                initial={false}
                animate={{
                  scale: isCurrent ? 1 : isComplete ? 0.95 : 0.9,
                  backgroundColor: isComplete
                    ? "hsl(var(--orbit-accent))"
                    : isCurrent
                      ? "hsl(var(--orbit-accent) / 0.1)"
                      : "transparent",
                  borderColor: isComplete
                    ? "hsl(var(--orbit-accent))"
                    : isCurrent
                      ? "hsl(var(--orbit-accent))"
                      : "hsl(var(--muted-foreground) / 0.3)",
                }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className={cn(
                  "flex items-center justify-center h-8 w-8 rounded-full text-xs font-medium border",
                  isComplete && "text-white",
                  isCurrent && "text-orbit-accent",
                  !isComplete && !isCurrent && "text-muted-foreground/50"
                )}
              >
                {isComplete ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 15 }}
                  >
                    <Check className="h-4 w-4" />
                  </motion.div>
                ) : (
                  stepNumber
                )}
              </motion.div>
              <span
                className={cn(
                  "text-[11px] font-medium transition-colors duration-300 hidden sm:block",
                  isCurrent && "text-foreground",
                  isComplete && "text-muted-foreground",
                  !isComplete && !isCurrent && "text-muted-foreground/50"
                )}
              >
                {step.label}
              </span>
              <span
                className={cn(
                  "text-[11px] font-medium transition-colors duration-300 sm:hidden",
                  isCurrent && "text-foreground",
                  isComplete && "text-muted-foreground",
                  !isComplete && !isCurrent && "text-muted-foreground/50"
                )}
              >
                {step.shortLabel}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div className="flex-1 h-px mx-3 relative overflow-hidden">
                <div className="absolute inset-0 bg-muted-foreground/20" />
                <motion.div
                  initial={false}
                  animate={{
                    scaleX: currentStep > stepNumber + 1
                      ? 1
                      : currentStep > stepNumber
                        ? 0.5
                        : 0,
                  }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="absolute inset-y-0 left-0 right-0 bg-orbit-accent origin-left"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
