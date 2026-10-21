"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPTY_ASSEMBLY,
  applyAssemblyEvents,
  toAssemblyEvent,
  type AssemblyEvent,
  type AssemblyState,
} from "@/lib/onboarding/map-assembly";

/**
 * The System Map as indexing discovers it. Feed it the indexing stream's raw messages; they are
 * folded in once per animation frame, so a burst of node events is one render, not hundreds.
 */
export function useMapAssembly() {
  const [state, setState] = useState<AssemblyState>(EMPTY_ASSEMBLY);
  const queue = useRef<AssemblyEvent[]>([]);
  const frame = useRef<number | null>(null);

  const flush = useCallback(() => {
    frame.current = null;
    const batch = queue.current;
    queue.current = [];
    setState((prev) => applyAssemblyEvents(prev, batch));
  }, []);

  const push = useCallback(
    (message: { type: string; data: unknown }) => {
      const event = toAssemblyEvent(message);
      if (!event) return;
      queue.current.push(event);
      // One frame per batch; the loop stops as soon as the queue is empty.
      if (frame.current === null) frame.current = requestAnimationFrame(flush);
    },
    [flush]
  );

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  return { assembly: state, push };
}
