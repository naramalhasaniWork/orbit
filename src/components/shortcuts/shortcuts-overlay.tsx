"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import { SHORTCUTS, SHORTCUT_GROUPS } from "@/lib/shortcuts/registry";
import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys";
import { replayTour } from "@/components/onboarding/tour/replay-tour";

interface ShortcutsOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsOverlay({ open, onOpenChange }: ShortcutsOverlayProps) {
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Single-key shortcuts pause while you type in a field.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group}>
              <h3 className=" tm-label text-muted-foreground mb-1.5">
                {group}
              </h3>
              <ul className="divide-y divide-border/60">
                {SHORTCUTS.filter((s) => s.group === group).map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="text-foreground">{s.label}</span>
                    <ShortcutKeys id={s.id} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            onOpenChange(false);
            void replayTour(router.push);
          }}
          className="self-start text-[13px] text-tm-t2 underline decoration-tm-line-strong underline-offset-4 hover:text-foreground hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Replay the product tour
        </button>
      </DialogContent>
    </Dialog>
  );
}
