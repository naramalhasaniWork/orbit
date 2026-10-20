import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { launchPipelineRun } from "@/services/orchestrator/run-launcher";
import { cancelRun } from "@/services/orchestrator/run-manager";
import { upsertCheckRun, findOpenPullRequestsForCommit } from "@/services/reporting/integrations/github-checks";
import { connectionAccess } from "./connections";
import { getPreviewProvider } from "./registry";
import { validatePreviewUrl } from "./url-policy";
import { ACCESS_MODES, archivePreviewEnvironments, upsertPreviewEnvironment } from "./environments";
import { PREVIEW_CHECK_NAME, decideTransition, previewCheckText, type Transition } from "./state-machine";
import { PREVIEW_STATUS, type PreviewHint, type PreviewStatus, type ResolveResult } from "./types";

/**
 * Preview coordinator: pending → ready | failed | gone.
 *
 * 1. A PR opened/synchronize on a bound project creates a pending PreviewDeployment and a
 *    "Waiting for preview" check. No run yet.
 * 2. A provider webhook (hint) or the reconcile job calls advancePreviewDeployment, which asks
 *    the provider API via resolve().
 * 3. When ready: validate the URL, upsert the PR's preview Environment, launch the run with
 *    environmentId + prNumber. Status changes use a conditional update on "pending", so a
 *    webhook and the reconcile job racing cannot launch two runs.
 */

interface PullRequestInput {
  number: number;
  headSha: string;
  branch: string;
  isFork: boolean;
}

async function setCheck(
  projectId: string,
  commitSha: string,
  checkRunId: string | null,
  state: { status: "in_progress" | "completed"; conclusion?: "success" | "failure" | "neutral"; title: string; summary: string }
): Promise<string | null> {
  return upsertCheckRun(projectId, { name: PREVIEW_CHECK_NAME, commitSha, checkRunId, ...state });
}

/** Returns the pending preview deployment, or null when the project has no preview binding. */
export async function startPreviewForPullRequest(
  projectId: string,
  pr: PullRequestInput
): Promise<{ id: string; status: PreviewStatus } | null> {
  const binding = await prisma.previewBinding.findUnique({ where: { projectId }, select: { id: true } });
  if (!binding) return null;

  const commitSha = pr.headSha.toLowerCase();
  const existing = await prisma.previewDeployment.findUnique({
    where: { preview_deployment_commit: { bindingId: binding.id, commitSha } },
    select: { id: true, status: true },
  });
  if (existing) return { id: existing.id, status: existing.status as PreviewStatus };

  await endPendingPreviews(projectId, { bindingId: binding.id, prNumber: pr.number, NOT: { commitSha } },
    "A newer commit on this PR is being tested instead", "Superseded");
  const fork = pr.isFork;
  const row = await prisma.previewDeployment.create({
    data: {
      projectId,
      bindingId: binding.id,
      commitSha,
      branch: pr.branch,
      prNumber: pr.number,
      status: fork ? PREVIEW_STATUS.failed : PREVIEW_STATUS.pending,
      error: fork ? "Pull requests from forks do not get preview deployments" : null,
    },
    select: { id: true, status: true },
  });

  const checkRunId = await setCheck(projectId, commitSha, null, fork
    ? { status: "completed", conclusion: "neutral", title: "No preview for fork PRs", summary: "Preview providers do not deploy pull requests from forks, so Orbit has nothing to test." }
    : { status: "in_progress", title: "Waiting for preview", summary: "Orbit will test this PR once its preview deployment is ready." });
  if (checkRunId) await prisma.previewDeployment.update({ where: { id: row.id }, data: { checkRunId } });

  if (!fork) {
    advancePreviewDeployment(row.id).catch((err) =>
      console.error(`[preview] Initial resolve failed for ${row.id}:`, err)
    );
  }
  return { id: row.id, status: row.status as PreviewStatus };
}

/** End pending previews (a newer push, or the PR closed) with a neutral check instead of leaving it hanging. */
async function endPendingPreviews(
  projectId: string,
  where: Prisma.PreviewDeploymentWhereInput,
  reason: string,
  title: string
): Promise<void> {
  const rows = await prisma.previewDeployment.findMany({
    where: { ...where, projectId, status: PREVIEW_STATUS.pending },
    select: { id: true, commitSha: true, checkRunId: true },
  });
  for (const row of rows) {
    const moved = await prisma.previewDeployment.updateMany({
      where: { id: row.id, status: PREVIEW_STATUS.pending },
      data: { status: PREVIEW_STATUS.gone, error: reason },
    });
    if (moved.count > 0 && row.checkRunId) {
      await setCheck(projectId, row.commitSha, row.checkRunId, { status: "completed", conclusion: "neutral", title, summary: reason });
    }
  }
}

/**
 * Before a connection or binding is deleted (rows cascade away), end its pending previews so
 * their "Orbit preview" checks complete as neutral instead of staying in progress forever.
 */
export async function closePreviewsForBindings(
  bindings: Array<{ id: string; projectId: string }>,
  reason: string
): Promise<void> {
  for (const binding of bindings) {
    await endPendingPreviews(binding.projectId, { bindingId: binding.id }, reason, "Preview source removed");
  }
}

export async function closePreviewsForPullRequest(projectId: string, prNumber: number): Promise<void> {
  await endPendingPreviews(projectId, { prNumber }, "Pull request closed", "PR closed");
  await archivePreviewEnvironments(projectId, prNumber);
}

/**
 * A provider webhook arrived for this connection. The body is an unsigned hint: it only makes
 * Orbit look sooner. It never picks which bindings or rows change and never decides a
 * transition; resolve() re-reads everything from the provider API. Fails closed: no commit,
 * or a commit with no pending row whose deployment the API can't confirm, changes nothing.
 */
export async function handleProviderSignal(connectionId: string, hint: PreviewHint): Promise<{ advanced: number }> {
  const connection = await prisma.previewConnection.findUnique({
    where: { id: connectionId },
    select: {
      provider: true, credentials: true, config: true,
      bindings: { select: { id: true, projectId: true, targetRef: true } },
    },
  });
  const provider = connection && getPreviewProvider(connection.provider);
  const access = connection && connectionAccess(connection);
  // Without a commit there is nothing to match safely; the reconcile job covers it.
  if (!connection || !provider || !access || !hint.isPreview || !hint.commitSha) return { advanced: 0 };

  const commitSha = hint.commitSha.toLowerCase();
  let advanced = 0;
  for (const binding of connection.bindings) {
    const id = await pendingRowForCommit(binding, commitSha, () =>
      provider.resolve({ access, targetRef: binding.targetRef, commitSha })
    );
    if (!id) continue;
    await advancePreviewDeployment(id, hint);
    advanced++;
  }
  return { advanced };
}

async function pendingRowForCommit(
  binding: { id: string; projectId: string },
  commitSha: string,
  confirmWithProvider: () => Promise<ResolveResult>
): Promise<string | null> {
  const row = await prisma.previewDeployment.findUnique({
    where: { preview_deployment_commit: { bindingId: binding.id, commitSha } },
    select: { id: true, status: true },
  });
  if (row) return row.status === PREVIEW_STATUS.pending ? row.id : null;

  // The PR webhook may be late or missing. Only start tracking the commit when the provider API
  // has a deployment for it on this target and GitHub has an open PR with it as head.
  if ((await confirmWithProvider()).state === "pending") return null;
  const [pr] = await findOpenPullRequestsForCommit(binding.projectId, commitSha);
  if (!pr) return null;
  const created = await startPreviewForPullRequest(binding.projectId, {
    number: pr.number, headSha: commitSha, branch: pr.branch, isFork: false,
  });
  return created?.status === PREVIEW_STATUS.pending ? created.id : null;
}

/** Ask the provider about one pending preview deployment and apply the transition. */
export async function advancePreviewDeployment(id: string, hint?: PreviewHint): Promise<PreviewStatus> {
  const row = await prisma.previewDeployment.findUnique({
    where: { id },
    include: { binding: { include: { connection: true } } },
  });
  if (!row) return PREVIEW_STATUS.gone;
  if (row.status !== PREVIEW_STATUS.pending) return row.status as PreviewStatus;

  const { binding } = row;
  const provider = getPreviewProvider(binding.connection.provider);
  const access = connectionAccess(binding.connection);
  let transition: Transition;
  if (!provider || !access) {
    transition = { kind: "fail", status: PREVIEW_STATUS.failed, externalId: null, conclusion: "neutral",
      error: "The preview connection's credentials are missing; reconnect it in Settings → Integrations" };
  } else {
    const result = await provider.resolve({ access, targetRef: binding.targetRef, commitSha: row.commitSha, hint });
    transition = decideTransition(result, row.createdAt, new Date());
  }
  if (transition.kind === "wait") return PREVIEW_STATUS.pending;

  if (transition.kind === "ready") {
    const checked = await validatePreviewUrl(transition.url, binding.allowedHostSuffixes);
    if (!checked.ok) {
      transition = { kind: "fail", status: PREVIEW_STATUS.failed, externalId: transition.externalId,
        error: checked.reason, conclusion: "failure" };
    } else {
      transition = { ...transition, url: checked.url };
    }
  }

  const claimed = await prisma.previewDeployment.updateMany({
    where: { id, status: PREVIEW_STATUS.pending },
    data: transition.kind === "ready"
      ? { status: PREVIEW_STATUS.ready, url: transition.url, externalId: transition.externalId, readyAt: new Date() }
      : { status: transition.status, externalId: transition.externalId, error: transition.error },
  });
  if (claimed.count === 0) return row.status as PreviewStatus;

  if (transition.kind === "fail") {
    await setCheck(row.projectId, row.commitSha, row.checkRunId, {
      status: "completed", conclusion: transition.conclusion, ...previewCheckText(transition),
    });
    return transition.status;
  }

  await launchPreviewRun(row, binding, transition);
  return PREVIEW_STATUS.ready;
}

async function launchPreviewRun(
  row: { id: string; projectId: string; commitSha: string; branch: string | null; prNumber: number | null; checkRunId: string | null },
  binding: { id: string; accessSecretPrefix: string | null },
  ready: Extract<Transition, { kind: "ready" }>
): Promise<void> {
  const prNumber = row.prNumber ?? 0;
  // The PR's environment is about to point at this commit; a run still going for an older
  // commit would otherwise switch URLs mid-run.
  await cancelSupersededRuns(binding.id, prNumber, row.commitSha);
  const environmentId = await upsertPreviewEnvironment({
    projectId: row.projectId,
    bindingId: binding.id,
    prNumber,
    url: ready.url,
    accessMode: binding.accessSecretPrefix ? ACCESS_MODES.cloudflareAccess : ACCESS_MODES.public,
  });

  const launched = await launchPipelineRun({
    projectId: row.projectId,
    mode: "targeted",
    trigger: "pr",
    branch: row.branch ?? "unknown",
    commitSha: row.commitSha,
    prNumber: row.prNumber,
    environmentId,
    metadata: { previewDeploymentId: row.id, previewUrl: ready.url } as Prisma.InputJsonValue,
  });

  await prisma.previewDeployment.update({
    where: { id: row.id },
    data: { environmentId, runId: launched.ok ? launched.runId : null, error: launched.ok ? null : launched.reason },
  });

  await setCheck(row.projectId, row.commitSha, row.checkRunId, launched.ok
    ? { status: "completed", conclusion: "success", ...previewCheckText(ready) }
    : { status: "completed", conclusion: "neutral", title: "Preview ready, run not started", summary: launched.reason });
}

async function cancelSupersededRuns(bindingId: string, prNumber: number, commitSha: string): Promise<void> {
  const older = await prisma.previewDeployment.findMany({
    where: { bindingId, prNumber, runId: { not: null }, NOT: { commitSha } },
    select: { runId: true },
  });
  for (const { runId } of older) {
    if (runId) await cancelRun(runId); // no-op for runs that already finished
  }
}
