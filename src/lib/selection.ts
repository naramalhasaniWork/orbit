/** Ids from `anchor` to `target` inclusive, in list order (either direction). */
export function rangeBetween(ids: readonly string[], anchor: string, target: string): string[] {
  const a = ids.indexOf(anchor);
  const b = ids.indexOf(target);
  if (a === -1 || b === -1) return b === -1 ? [] : [target];
  const [from, to] = a <= b ? [a, b] : [b, a];
  return ids.slice(from, to + 1);
}

export interface SelectionState {
  selected: ReadonlySet<string>;
  /** Last row clicked without shift; the start of the next shift-click range. */
  anchor: string | null;
}

/**
 * Checkbox click on `target`. A plain click toggles it. Shift-click applies the new state
 * of `target` to every row between the anchor and `target` in the visible order `ids`.
 */
export function clickSelection(
  state: SelectionState,
  ids: readonly string[],
  target: string,
  shift: boolean
): SelectionState {
  const next = new Set(state.selected);
  const checking = !next.has(target);
  const targets =
    shift && state.anchor && ids.includes(state.anchor)
      ? rangeBetween(ids, state.anchor, target)
      : [target];
  for (const id of targets) {
    if (checking) next.add(id);
    else next.delete(id);
  }
  return { selected: next, anchor: target };
}

/** Drop selected ids that are no longer visible (filtered out or deleted). */
export function pruneSelection(selected: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const visible = new Set(ids);
  return new Set(Array.from(selected).filter((id) => visible.has(id)));
}
