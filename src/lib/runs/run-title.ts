interface RunTitleParts {
  id: string;
  /** Per-project run number; 0 or missing means none has been assigned. */
  sequenceNumber?: number | null;
  projectName?: string | null;
  prNumber?: number | null;
}

/** "Run #412 · checkout · PR #318". Falls back to the short id for unnumbered runs. */
export function formatRunTitle({ id, sequenceNumber, projectName, prNumber }: RunTitleParts): string {
  const parts = [sequenceNumber ? `Run #${sequenceNumber}` : `Run ${id.slice(0, 8)}`];
  if (projectName) parts.push(projectName);
  if (prNumber) parts.push(`PR #${prNumber}`);
  return parts.join(" · ");
}
