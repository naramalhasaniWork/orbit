import type { RepoItem } from "./onboarding-types";
import type { ProgressSnapshot } from "@/lib/onboarding/resume";

export interface OnboardingProgress {
  snapshot: ProgressSnapshot;
  projectId: string | null;
  repo: RepoItem | null;
  enabledTestCount: number;
}

const EMPTY: OnboardingProgress = {
  snapshot: { hasProject: false, indexed: false, hasPlan: false },
  projectId: null,
  repo: null,
  enabledTestCount: 0,
};

/** Read what already exists for a project so the wizard can resume where the user left off. */
export async function detectOnboardingProgress(
  targetProjectId: string | null
): Promise<OnboardingProgress> {
  // No project specified: start fresh at step 1
  if (!targetProjectId) return EMPTY;

  try {
    const res = await fetch(`/api/projects/${targetProjectId}`);
    if (!res.ok) return EMPTY;

    const json = await res.json();
    if (!json.success) return EMPTY;

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

    let enabledTestCount = 0;
    let hasPlan = false;
    const planRes = await fetch(`/api/projects/${pid}/plan`);
    if (planRes.ok) {
      const planJson = await planRes.json();
      const testCases: Array<{ isEnabled: boolean }> = planJson.data?.testCases ?? [];
      hasPlan = testCases.length > 0;
      enabledTestCount = testCases.filter((t) => t.isEnabled).length;
    }

    return {
      snapshot: { hasProject: true, indexed: !!project.lastIndexedAt, hasPlan },
      projectId: pid,
      repo,
      enabledTestCount,
    };
  } catch {
    return EMPTY;
  }
}
