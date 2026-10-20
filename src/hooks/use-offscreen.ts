"use client";

import { useEffect, useRef, useState } from "react";

/**
 * True while the element is outside the viewport. Loops use it to set
 * `animation-play-state: paused` so nothing animates where nobody can see it.
 */
export function useOffscreen<T extends Element>() {
  const ref = useRef<T>(null);
  const [offscreen, setOffscreen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setOffscreen(!entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return { ref, offscreen };
}
