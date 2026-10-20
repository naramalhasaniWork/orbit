export const FIRST_STEP = 1;
export const LAST_STEP = 6;

/** What the server already has for the project being set up. */
export interface ProgressSnapshot {
  hasProject: boolean;
  indexed: boolean;
  hasPlan: boolean;
}

/** Where to land with no step in the URL: the furthest step the data justifies, as before. */
export function detectedStep(p: ProgressSnapshot): number {
  if (!p.hasProject) return 1;
  if (p.hasPlan) return 5;
  if (p.indexed) return 3;
  return 2;
}

/** Furthest step the project can actually show (every later step needs data from an earlier one). */
export function maxReachableStep(p: ProgressSnapshot): number {
  if (!p.hasProject) return 1;
  if (!p.indexed) return 2;
  if (!p.hasPlan) return 5; // the plan step generates the plan, so it is reachable without one
  return LAST_STEP;
}

export function parseStepParam(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  return Number.parseInt(value, 10);
}

/** Step to resume at after a reload: the URL's step, kept within what the project can show. */
export function resolveResumeStep(requested: number | null, p: ProgressSnapshot): number {
  if (requested === null) return detectedStep(p);
  return Math.min(Math.max(requested, FIRST_STEP), maxReachableStep(p));
}
