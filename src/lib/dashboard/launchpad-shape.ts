/**
 * Pure shaping for the home launchpad: database rows in, display rows out. No I/O here, so the
 * ordering and fallbacks are unit-tested without a database (src/__tests__/unit/home-launchpad.test.ts).
 */
import { STATUS_TONES, isLiveRunStatus, toneForRun, type StatusTone } from "@/lib/status-tone";
import { toPersonView, type AvatarSource, type PersonView } from "@/lib/avatar/resolve";

/** A related user as selected with PERSON_SELECT. */
export type PersonRow = AvatarSource & { name: string | null; email: string };

// ------------------------------------------------------------------
// Pull requests: every PR and branch push Orbit checked, one row each.
// ------------------------------------------------------------------

export interface PrRunRow {
  id: string;
  sequenceNumber: number;
  trigger: string;
  status: string;
  branch: string | null;
  commitSha: string | null;
  prNumber: number | null;
  failed: number;
  flaky: number;
  durationMs: number | null;
  createdAt: Date;
  metadata: unknown;
  triggeredBy: PersonRow | null;
}

export interface PullRequestRow {
  runId: string;
  runNumber: number;
  /** "acme/web#318" for a PR, "acme/web" for a push. */
  ref: string;
  /** The PR title when GitHub sent one, else the branch and short commit. */
  title: string;
  /** "PR", "Push": what started the check. */
  triggerLabel: string;
  branch: string | null;
  commit: string | null;
  /** Who started the run in Orbit. Webhook runs have none: GitHub's PR author is not stored. */
  author: PersonView | null;
  journeys: string[];
  tone: StatusTone;
  durationMs: number | null;
  createdAt: string;
}

const TRIGGER_WORDS: Record<string, string> = { pr: "PR", push: "Push", deploy: "Deploy" };

/** A person for display: their name, else the part of the email before the @; uploaded photo, then GitHub's. */
export function personOf(user: PersonRow | null): PersonView | null {
  if (!user) return null;
  return { ...toPersonView(user), name: user.name?.trim() || user.email.split("@")[0] };
}

function prTitleOf(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const title = (metadata as { prTitle?: unknown }).prTitle;
  return typeof title === "string" && title.trim() ? title.trim() : null;
}

/** Distinct journeys per run, in the order first seen. Results without a journey are skipped. */
export function journeysByRun(results: { testRunId: string; testCase: { journey: string | null } }[]): Map<string, string[]> {
  const byRun = new Map<string, string[]>();
  for (const r of results) {
    const j = r.testCase.journey;
    if (!j) continue;
    const list = byRun.get(r.testRunId) ?? [];
    if (!list.includes(j)) list.push(j);
    byRun.set(r.testRunId, list);
  }
  return byRun;
}

export function shapePullRequestRows(
  runs: PrRunRow[],
  journeys: Map<string, string[]>,
  repo: { owner: string; name: string }
): PullRequestRow[] {
  const repoRef = `${repo.owner}/${repo.name}`;
  return runs.map((r) => {
    const commit = r.commitSha ? r.commitSha.slice(0, 7) : null;
    const fallback = [r.branch, commit].filter(Boolean).join(" @ ") || `Run #${r.sequenceNumber}`;
    return {
      runId: r.id,
      runNumber: r.sequenceNumber,
      ref: r.prNumber ? `${repoRef}#${r.prNumber}` : repoRef,
      title: prTitleOf(r.metadata) ?? fallback,
      triggerLabel: TRIGGER_WORDS[r.trigger] ?? r.trigger,
      branch: r.branch,
      commit,
      author: personOf(r.triggeredBy),
      journeys: journeys.get(r.id) ?? [],
      tone: toneForRun(r.status, r),
      durationMs: r.durationMs,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

// ------------------------------------------------------------------
// Jump back in: what this person touched, and what needs them, across runs, plans and the map.
// ------------------------------------------------------------------

export interface JumpItem {
  key: string;
  kind: "run" | "plan" | "node";
  title: string;
  detail: string;
  href: string;
  at: string;
  tone: StatusTone;
}

export const JUMP_LIMIT = 5;

/** Live runs first (they are happening now), then newest first; one row per destination. */
export function rankJumpItems(items: JumpItem[], limit = JUMP_LIMIT): JumpItem[] {
  const seen = new Set<string>();
  return [...items]
    .sort((a, b) => Number(b.tone === "live") - Number(a.tone === "live") || b.at.localeCompare(a.at))
    .filter((i) => (seen.has(i.href) ? false : (seen.add(i.href), true)))
    .slice(0, limit);
}

export interface JumpRun {
  id: string;
  sequenceNumber: number;
  status: string;
  failed: number;
  flaky: number;
  triggeredById: string | null;
  createdAt: Date;
}

export function jumpFromRun(r: JumpRun, userId: string, projectId: string): JumpItem {
  const tone = toneForRun(r.status, r);
  const why = isLiveRunStatus(r.status)
    ? "Running now"
    : tone === "fail"
      ? r.failed > 0 ? `${r.failed} failed` : "Failed"
      : `${STATUS_TONES[tone].label}${r.triggeredById === userId ? " · you started it" : ""}`;
  return {
    key: `run-${r.id}`,
    kind: "run",
    title: `Run #${r.sequenceNumber}`,
    detail: why,
    href: `/dashboard/runs/${r.id}?project=${projectId}`,
    at: r.createdAt.toISOString(),
    tone,
  };
}

export function jumpFromPlan(
  p: { id: string; version: number; approvedAt: Date | null; approvedById: string | null; createdAt: Date },
  userId: string,
  projectId: string
): JumpItem {
  const pending = p.approvedAt === null;
  return {
    key: `plan-${p.id}`,
    kind: "plan",
    title: `Test plan v${p.version}`,
    detail: pending ? "Waiting for approval" : p.approvedById === userId ? "You approved it" : "Approved",
    href: `/dashboard/plans?project=${projectId}`,
    at: (p.approvedAt ?? p.createdAt).toISOString(),
    tone: pending ? "info" : "pass",
  };
}

export function jumpFromNode(n: { id: string; name: string; type: string; changeStatus: string; updatedAt: Date }, projectId: string): JumpItem {
  return {
    key: `node-${n.id}`,
    kind: "node",
    title: n.name,
    detail: `${n.changeStatus === "added" ? "New" : "Changed"} ${n.type} since last sync`,
    href: `/dashboard/map?project=${projectId}&view=impact&node=${n.id}`,
    at: n.updatedAt.toISOString(),
    tone: "info",
  };
}

// ------------------------------------------------------------------
// Team activity: who ran what, who approved a plan. Only shown with more than one member.
// ------------------------------------------------------------------

export interface ActivityRow {
  id: string;
  who: PersonView | null;
  /** "started Run #12", "approved the test plan". */
  what: string;
  href: string | null;
  at: string;
}

/** The audit actions the home feed tells; everything else (logins, keys, settings) stays in the audit log. */
export const ACTIVITY_VERBS: Record<string, string> = {
  "run.trigger": "started",
  "test_run.triggered": "started",
  "run.cancel": "cancelled",
  "test_run.completed": "finished",
  "plan.approved": "approved the test plan",
  "plan.rejected": "sent back the test plan",
  "test_plan.generated": "generated a test plan",
  "member.joined": "joined the workspace",
  "project.create": "added a project",
};

export interface AuditRow {
  id: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  createdAt: Date;
  user: PersonRow | null;
}

export function shapeActivity(logs: AuditRow[], runNumbers: Map<string, number>, memberCount: number): ActivityRow[] {
  if (memberCount <= 1) return [];
  return logs.flatMap((l) => {
    const verb = ACTIVITY_VERBS[l.action];
    if (!verb) return [];
    const isRun = l.action.startsWith("run.") || l.action.startsWith("test_run.");
    const n = isRun && l.resourceId ? runNumbers.get(l.resourceId) : undefined;
    if (isRun && n === undefined) return []; // the run is gone or belongs elsewhere
    return [
      {
        id: l.id,
        who: personOf(l.user),
        what: isRun ? `${verb} Run #${n}` : verb,
        href: isRun ? `/dashboard/runs/${l.resourceId}` : l.action.startsWith("plan.") || l.action === "test_plan.generated" ? "/dashboard/plans" : null,
        at: l.createdAt.toISOString(),
      },
    ];
  });
}
