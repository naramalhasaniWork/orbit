import { createHash } from "node:crypto";

/** The browser viewport every run uses unless a case asks for another. */
export const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

interface StepLike {
  action: string;
  expected: string;
  selector?: string;
}

/** Fingerprint of a case's steps; a script compiled from other steps is ignored. */
export function stepsHash(steps: StepLike[]): string {
  const normalized = steps.map((s) => [s.action.trim(), s.expected.trim(), s.selector?.trim() ?? ""]);
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

/** Scripts are only valid for the environment, role and viewport they were recorded in. */
export function buildEnvKey(
  environmentId: string,
  role?: string | null,
  viewport: { width: number; height: number } = DEFAULT_VIEWPORT
): string {
  return `${environmentId}:${role?.trim().toUpperCase() || "DEFAULT"}:${viewport.width}x${viewport.height}`;
}
