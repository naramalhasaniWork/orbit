/**
 * Browser-facing URL for a run artifact. Always routes through the
 * authenticated file-serving endpoint so it works identically for
 * local-volume and S3 storage, and storage keys never leak to clients.
 */
export function artifactFileUrl(
  projectId: string,
  runId: string,
  artifactId: string
): string {
  return `/api/projects/${projectId}/runs/${runId}/artifacts/${artifactId}/file`;
}

/**
 * Absolute variant for contexts that leave the app (Slack messages,
 * Linear issues, GitHub comments). Falls back to the relative path when
 * no deployment URL is configured.
 */
export function absoluteArtifactFileUrl(
  projectId: string,
  runId: string,
  artifactId: string
): string {
  const base = process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? "";
  return `${base}${artifactFileUrl(projectId, runId, artifactId)}`;
}
