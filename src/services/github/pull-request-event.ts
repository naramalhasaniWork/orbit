import type { Prisma } from "@/generated/prisma/client";
import { launchPipelineRun, launchSummary } from "@/services/orchestrator/run-launcher";
import { closePreviewsForPullRequest, startPreviewForPullRequest } from "@/services/preview/coordinator";

export interface PullRequestPayload {
  number: number;
  title: string;
  head: { ref: string; sha: string; repo?: { full_name?: string } | null };
  base?: { repo?: { full_name?: string } | null };
}

/**
 * pull_request webhook. With a preview binding the run waits for the PR's preview deployment
 * (see services/preview/coordinator). Without one the run starts now against the project's
 * default environment, as before.
 */
export async function handlePullRequestEvent(
  project: { id: string; defaultBranch: string },
  action: string,
  pr: PullRequestPayload | undefined
): Promise<Record<string, unknown>> {
  if (!pr) return { status: "pr_processed", action };

  if (action === "closed") {
    await closePreviewsForPullRequest(project.id, pr.number);
    return { status: "pr_processed", action };
  }
  if (action !== "opened" && action !== "synchronize" && action !== "reopened") {
    return { status: "pr_processed", action };
  }

  const headRepo = pr.head.repo?.full_name;
  const baseRepo = pr.base?.repo?.full_name;
  const preview = await startPreviewForPullRequest(project.id, {
    number: pr.number,
    headSha: pr.head.sha,
    branch: pr.head.ref,
    isFork: !!headRepo && !!baseRepo && headRepo !== baseRepo,
  });
  if (preview) {
    return { status: "preview_pending", action, previewDeploymentId: preview.id, previewStatus: preview.status };
  }

  const launched = await launchPipelineRun({
    projectId: project.id,
    mode: "targeted",
    trigger: "pr",
    branch: pr.head.ref ?? project.defaultBranch,
    commitSha: pr.head.sha ?? null,
    prNumber: pr.number,
    metadata: { prTitle: pr.title ?? null } as Prisma.InputJsonValue,
  });
  return { status: "pr_processed", action, ...launchSummary(launched) };
}
