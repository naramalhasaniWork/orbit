type Defaults = Record<string, string>;
export type ParamUpdates<D extends Defaults> = { [K in keyof D]?: string | null };

/** Current values for each known key; absent keys fall back to their default. */
export function readParams<D extends Defaults>(search: string, defaults: D): D {
  const sp = new URLSearchParams(search);
  const out: Defaults = {};
  for (const key of Object.keys(defaults)) out[key] = sp.get(key) ?? defaults[key];
  return out as D;
}

/**
 * Apply updates to a query string. Keys outside `defaults` (e.g. `project`) are kept,
 * and values equal to their default (or null) are dropped so URLs stay short.
 */
export function buildSearch<D extends Defaults>(
  search: string,
  updates: ParamUpdates<D>,
  defaults: D
): string {
  const sp = new URLSearchParams(search);
  for (const [key, value] of Object.entries(updates) as [string, string | null | undefined][]) {
    if (value === undefined) continue;
    if (value === null || value === "" || value === defaults[key]) sp.delete(key);
    else sp.set(key, value);
  }
  return sp.toString();
}

export function parsePositiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
