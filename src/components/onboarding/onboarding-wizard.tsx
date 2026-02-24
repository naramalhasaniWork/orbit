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

/**
 * Detect onboarding progress for a specific project. Returns the step to
 * resume from and the project context needed to render it.
 */
async function detectOnboardingProgress(
  targetProjectId: string | null
): Promise<{
  step: number;
  projectId: string | null;
  repo: RepoItem | null;
  enabledTestCount: number;
}> {
  const empty = { step: 1, projectId: null, repo: null, enabledTestCount: 0 };

  // No project specified — start fresh at step 1
  if (!targetProjectId) return empty;

  try {
    // Fetch the specific project
    const res = await fetch(`/api/projects/${targetProjectId}`);
    if (!res.ok) return empty;

    const json = await res.json();
    if (!json.success) return empty;

    const project = json.data;
    const pid = project.id as string;
    const repo: RepoItem = {
      id: pid,
      name: project.repoName ?? project.name,
      fullName: `${project.repoOwner ?? ""}/${project.repoName ?? project.name}`,
      url: project.repoUrl ?? "",
      owner: project.repoOwner ?? "",
      defaultBranch: project.defaultBranch ?? "main",
      isPrivate: false,
      language: project.framework ?? "Unknown",
      stars: 0,
      updatedAt: project.updatedAt ?? new Date().toISOString(),
    };

    // Check if there's a test plan with enabled test cases
    const planRes = await fetch(`/api/projects/${pid}/plan`);
    if (planRes.ok) {
      const planJson = await planRes.json();
      const testCases = planJson.data?.testCases ?? [];
      if (testCases.length > 0) {
        const enabled = testCases.filter((t: { isEnabled: boolean }) => t.isEnabled).length;
        return { step: 5, projectId: pid, repo, enabledTestCount: enabled };
      }
    }

    // Indexed but no plan -> map preview
    if (project.lastIndexedAt) {
      return { step: 3, projectId: pid, repo, enabledTestCount: 0 };
    }

    // Project exists but not indexed -> indexing step
    return { step: 2, projectId: pid, repo, enabledTestCount: 0 };
  } catch {
    return empty;
  }
}

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
    detectOnboardingProgress(initialProjectId ?? null).then((result) => {
      if (result.projectId) {
        setProjectId(result.projectId);
        setSelectedRepo(result.repo);
        setEnabledTestCount(result.enabledTestCount);
      }
      setStep(result.step);
    });
  }, [initialProjectId]);

  const goTo = useCallback((nextStep: number) => {
    setDirection(nextStep > step ? 1 : -1);
    setStep(nextStep);
  }, [step]);

  const handleRepoSelect = useCallback(
    (repo: RepoItem, newProjectId: string) => {
      setSelectedRepo(repo);
      setProjectId(newProjectId);
      // Update URL so page refresh resumes correctly
      const url = new URL(window.location.href);
      url.searchParams.set("project", newProjectId);
      window.history.replaceState({}, "", url.toString());
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
