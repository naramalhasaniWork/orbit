import { logger } from "@/server/observability/logger";

/** Pre-W3 settings keys a reader can still fall back to until the old keys are stripped. */
export type LegacySource =
  | "workspace.linear"
  | "workspace.slack"
  | "project.linear"
  | "project.slack"
  | "project.webhooks"
  | "project.testingNotes";

const counts = new Map<LegacySource, number>();

/**
 * Record a dual-read fallback to a legacy settings key. A non-zero count after the
 * 20261025 backfill has run means a reader or writer still depends on the old keys.
 */
export function recordLegacyRead(source: LegacySource, ids: { workspaceId?: string; projectId?: string }): void {
  const count = (counts.get(source) ?? 0) + 1;
  counts.set(source, count);
  logger.info({ legacyRead: source, legacyReadCount: count, ...ids }, "config read fell back to legacy settings");
}

export function legacyReadCounts(): Partial<Record<LegacySource, number>> {
  return Object.fromEntries(counts);
}

export function resetLegacyReadCounts(): void {
  counts.clear();
}
