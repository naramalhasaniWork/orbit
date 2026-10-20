"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getShortcut, type ShortcutDef, type ShortcutId } from "@/lib/shortcuts/registry";

const KBD_CLASS =
  "inline-flex min-w-[1.25rem] items-center justify-center px-1.5 py-0.5 rounded bg-foreground/[0.08] text-[10px] font-mono text-muted-foreground";

function useIsMac(): boolean {
  const [isMac, setIsMac] = useState(true);
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);
  return isMac;
}

function ShortcutKeysFor({ def, className }: { def: ShortcutDef; className?: string }) {
  const isMac = useIsMac();
  const label = (k: string) => (k.length === 1 ? k.toUpperCase() : k);

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {def.mod && <kbd className={KBD_CLASS}>{isMac ? "⌘" : "Ctrl"}</kbd>}
      {def.keys.map((k, i) => (
        <span key={`${k}-${i}`} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-[10px] text-muted-foreground/60">then</span>}
          <kbd className={KBD_CLASS}>{label(k)}</kbd>
        </span>
      ))}
    </span>
  );
}

/** Renders a registry shortcut as keycaps, e.g. `G then R` or `⌘ K`. */
export function ShortcutKeys({ id, className }: { id: ShortcutId; className?: string }) {
  return <ShortcutKeysFor def={getShortcut(id)} className={className} />;
}
