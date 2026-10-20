"use client";

import { useEffect } from "react";
import { markTileDataUri } from "@/lib/closing-o";

const ID = "orbit-live-favicon";

/** While a run is live the browser tab shows the running mark. Static icons, swapped, never animated. */
export function LiveFavicon({ live }: { live: boolean }) {
  useEffect(() => {
    if (!live) return;
    const link = document.createElement("link");
    link.id = ID;
    link.rel = "icon";
    link.type = "image/svg+xml";
    link.href = markTileDataUri("running", 32);
    document.head.appendChild(link);
    return () => link.remove();
  }, [live]);
  return null;
}
