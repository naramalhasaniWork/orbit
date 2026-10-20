/** Shape of GET /api/health (see src/app/api/health/route.ts). */
export interface HealthResponse {
  status: "ok" | "unhealthy";
  checks: { database: "ok" | "fail"; redis: "ok" | "fail" };
  workers?: "ok" | "none" | "unknown";
}

export type ProjectHealth = "healthy" | "degraded" | "failing";

export interface BadgeStatus {
  tone: ProjectHealth;
  label: string;
  detail: string;
}

const PROJECT_LABELS: Record<ProjectHealth, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  failing: "Failing",
};

/**
 * Infrastructure problems outrank project test health: a "Healthy" badge
 * while runs can't start is the dishonesty this replaces. Returns null when
 * there is nothing real to report (no project, no outage).
 */
export function resolveBadgeStatus(
  system: HealthResponse | undefined,
  projectStatus: string | undefined
): BadgeStatus | null {
  if (system?.checks.database === "fail") {
    return { tone: "failing", label: "Database offline", detail: "Orbit cannot reach its database." };
  }
  if (system?.checks.redis === "fail") {
    return {
      tone: "failing",
      label: "Workers offline",
      detail: "Background workers unavailable: Redis is not reachable. Syncs, plans and runs can't start.",
    };
  }
  if (system?.workers === "none") {
    return {
      tone: "degraded",
      label: "Workers offline",
      detail: "No background worker is running. Syncs, plans and runs will stay queued.",
    };
  }
  if (projectStatus && projectStatus in PROJECT_LABELS) {
    const tone = projectStatus as ProjectHealth;
    return { tone, label: PROJECT_LABELS[tone], detail: `Project test health: ${PROJECT_LABELS[tone].toLowerCase()}` };
  }
  return null;
}
