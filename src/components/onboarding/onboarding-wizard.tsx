"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { StepIndicator } from "./step-indicator";
import { ConnectRepo } from "./steps/connect-repo";
import { IndexingProgress } from "./steps/indexing-progress";
import { MapPreview } from "./steps/map-preview";
import { ConfigureEnv } from "./steps/configure-env";
import { PlanPreview } from "./steps/plan-preview";
import { LaunchRun } from "./steps/launch-run";
import type { RepoItem } from "./onboarding-types";

export function OnboardingWizard() {
  const [step, setStep] = useState(1);
  const [selectedRepo, setSelectedRepo] = useState<RepoItem | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [enabledTestCount, setEnabledTestCount] = useState(0);
  const [transitioning, setTransitioning] = useState(false);

  const goTo = useCallback((nextStep: number) => {
    setTransitioning(true);
    setTimeout(() => {
      setStep(nextStep);
      setTransitioning(false);
    }, 150);
  }, []);

  const handleRepoSelect = useCallback(
    (repo: RepoItem, newProjectId: string) => {
      setSelectedRepo(repo);
      setProjectId(newProjectId);
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
        <div
          className={cn(
            "transition-opacity duration-150",
            transitioning ? "opacity-0" : "opacity-100"
          )}
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
            />
          )}
        </div>
      </div>
    </div>
  );
}
