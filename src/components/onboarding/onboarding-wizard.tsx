"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { StepIndicator } from "./step-indicator";
import { ConnectRepo } from "./steps/connect-repo";
import { IndexingProgress } from "./steps/indexing-progress";
import { MapPreview } from "./steps/map-preview";
import { ConfigureEnv } from "./steps/configure-env";
import { PlanPreview } from "./steps/plan-preview";
import { LaunchRun } from "./steps/launch-run";
import type { RepoItem } from "./onboarding-types";
import { detectOnboardingProgress } from "./detect-progress";
import { parseStepParam, resolveResumeStep } from "@/lib/onboarding/resume";

/** Keep the current step in the URL (alongside ?project=) so a reload resumes it. */
function writeStepToUrl(step: number, projectId?: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("step", String(step));
  if (projectId) url.searchParams.set("project", projectId);
  window.history.replaceState({}, "", url.toString());
}

const pageVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 24 : -24,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -24 : 24,
    opacity: 0,
  }),
};

const pageTransition = {
  type: "tween" as const,
  duration: 0.25,
  ease: "easeInOut" as const,
};

interface OnboardingWizardProps {
  initialProjectId?: string | null;
}

export function OnboardingWizard({ initialProjectId }: OnboardingWizardProps) {
  const [step, setStep] = useState(0); // 0 = detecting
  const [direction, setDirection] = useState(1);
  const [selectedRepo, setSelectedRepo] = useState<RepoItem | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [enabledTestCount, setEnabledTestCount] = useState(0);

  // On mount, detect where the user left off
  useEffect(() => {
    const requested = parseStepParam(new URLSearchParams(window.location.search).get("step"));
    detectOnboardingProgress(initialProjectId ?? null).then((result) => {
      if (result.projectId) {
        setProjectId(result.projectId);
        setSelectedRepo(result.repo);
        setEnabledTestCount(result.enabledTestCount);
      }
      const resumeAt = resolveResumeStep(requested, result.snapshot);
      writeStepToUrl(resumeAt);
      setStep(resumeAt);
    });
  }, [initialProjectId]);

  const goTo = useCallback((nextStep: number) => {
    setDirection(nextStep > step ? 1 : -1);
    setStep(nextStep);
    writeStepToUrl(nextStep);
  }, [step]);

  const handleRepoSelect = useCallback(
    (repo: RepoItem, newProjectId: string) => {
      setSelectedRepo(repo);
      setProjectId(newProjectId);
      // Update URL so page refresh resumes correctly
      writeStepToUrl(2, newProjectId);
      goTo(2);
    },
    [goTo]
  );

  const handleIndexingComplete = useCallback(() => {
    goTo(3);
  }, [goTo]);

  const handleMapContinue = useCallback(() => {
    goTo(4);
  }, [goTo]);

  const handleEnvContinue = useCallback(() => {
    goTo(5);
  }, [goTo]);

  const handleEnvSkip = useCallback(() => {
    goTo(5);
  }, [goTo]);

  const handlePlanContinue = useCallback(
    (count: number) => {
      setEnabledTestCount(count);
      goTo(6);
    },
    [goTo]
  );

  // Show loading state while detecting progress
  if (step === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-orbit-accent" />
        <span className="text-sm text-muted-foreground">Resuming your setup...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 pb-8 pt-2">
        <div className="text-center mb-6">
          <h1 className="text-sm font-medium text-muted-foreground tracking-wide uppercase">
            Set up your project
          </h1>
        </div>
        <StepIndicator currentStep={step} />
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={pageTransition}
          >
            {step === 1 && <ConnectRepo onSelect={handleRepoSelect} />}

            {step === 2 && selectedRepo && projectId && (
              <IndexingProgress
                repo={selectedRepo}
                projectId={projectId}
                onComplete={handleIndexingComplete}
              />
            )}

            {step === 3 && projectId && (
              <MapPreview
                projectId={projectId}
                onContinue={handleMapContinue}
                onBack={() => goTo(1)}
              />
            )}

            {step === 4 && projectId && (
              <ConfigureEnv
                projectId={projectId}
                onContinue={handleEnvContinue}
                onSkip={handleEnvSkip}
                onBack={() => goTo(3)}
              />
            )}

            {step === 5 && projectId && (
              <PlanPreview
                projectId={projectId}
                onContinue={handlePlanContinue}
                onBack={() => goTo(4)}
              />
            )}

            {step === 6 && selectedRepo && projectId && (
              <LaunchRun
                projectId={projectId}
                enabledTestCount={enabledTestCount}
                repoName={selectedRepo.fullName}
                onBack={() => goTo(5)}
                onConfigureEnv={() => goTo(4)}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
