"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clickSelection, pruneSelection, type SelectionState } from "@/lib/selection";

const EMPTY: SelectionState = { selected: new Set(), anchor: null };

/** Checkbox selection over the rows currently visible, in display order, with shift-click ranges. */
export function useRowSelection(visibleIds: readonly string[]) {
  const [state, setState] = useState<SelectionState>(EMPTY);
  const idsRef = useRef(visibleIds);
  idsRef.current = visibleIds;
  const idsKey = visibleIds.join("|");

  // Filtering, paging or a refresh can hide selected rows; they must not be acted on unseen.
  useEffect(() => {
    setState((s) => {
      const kept = pruneSelection(s.selected, idsRef.current);
      return kept.size === s.selected.size ? s : { selected: kept, anchor: s.anchor };
    });
  }, [idsKey]);

  const toggle = useCallback(
    (id: string, shift: boolean) => setState((s) => clickSelection(s, idsRef.current, id, shift)),
    []
  );
  const selectAll = useCallback(
    () => setState({ selected: new Set(idsRef.current), anchor: null }),
    []
  );
  const clear = useCallback(() => setState(EMPTY), []);

  const count = state.selected.size;
  return {
    selected: state.selected,
    count,
    allSelected: visibleIds.length > 0 && count === visibleIds.length,
    toggle,
    selectAll,
    clear,
  };
}
