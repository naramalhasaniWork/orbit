/**
 * Which environment a run uses when the caller doesn't name one:
 *   1. the environment flagged as default (isDefault), unless it's production
 *   2. otherwise by type: staging, then qa, then preview
 *   3. ties go to the oldest environment
 * Production is never chosen implicitly.
 */
const TYPE_PREFERENCE: Record<string, number> = { staging: 0, qa: 1, preview: 2 };

/**
 * Archived environments and the per-PR environments the preview coordinator creates
 * (source "preview") are never a default: the latter test one PR's code.
 */
export function isDefaultCandidate(env: { archivedAt: Date | null; source: string | null }): boolean {
  return env.archivedAt === null && env.source !== "preview";
}

interface EnvironmentCandidate {
  type: string;
  isDefault: boolean;
  createdAt: Date;
}

export function pickDefaultEnvironment<T extends EnvironmentCandidate>(environments: T[]): T | null {
  const runnable = environments.filter((e) => e.type !== "production");
  const flagged = runnable.find((e) => e.isDefault);
  if (flagged) return flagged;

  const rank = (e: T) => TYPE_PREFERENCE[e.type] ?? Object.keys(TYPE_PREFERENCE).length;
  const sorted = [...runnable].sort(
    (a, b) => rank(a) - rank(b) || a.createdAt.getTime() - b.createdAt.getTime()
  );
  return sorted[0] ?? null;
}
