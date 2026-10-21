"use client";

import { useEffect, useRef } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TourStop } from "@/lib/onboarding/tour";

interface CoachmarkProps {
  stop: TourStop;
  target: HTMLElement;
  index: number;
  total: number;
  onNext: () => void;
  onSkip: () => void;
}

/** Room around the target inside the spotlight, px. */
const PAD = 6;

/**
 * Keeps the spotlight on the target while the page scrolls or reflows. Position is written straight
 * to the element's transform (no React render per frame); one frame per event, nothing loops.
 */
function useSpotlight(target: HTMLElement) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame: number | null = null;
    const place = () => {
      frame = null;
      const el = ref.current;
      if (!el) return;
      const r = target.getBoundingClientRect();
      el.style.width = `${r.width + PAD * 2}px`;
      el.style.height = `${r.height + PAD * 2}px`;
      el.style.transform = `translate(${r.left - PAD}px, ${r.top - PAD}px)`;
    };
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(place);
    };
    place();
    const ro = new ResizeObserver(schedule);
    ro.observe(target);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, { capture: true });
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [target]);
  return ref;
}

/**
 * One tour stop: a spotlight on the real element and a small card beside it. Focus moves into the
 * card; the page stays usable (the spotlight ignores the pointer and focus is not trapped), so the
 * highlighted element can be clicked or tabbed to. Esc skips the tour.
 */
export function Coachmark({ stop, target, index, total, onNext, onSkip }: CoachmarkProps) {
  const spotlight = useSpotlight(target);
  const next = useRef<HTMLButtonElement>(null);
  const anchor = useRef(target);
  anchor.current = target;
  const last = index === total - 1;

  return (
    <>
      <div
        ref={spotlight}
        aria-hidden="true"
        className="tm-spotlight pointer-events-none fixed left-0 top-0 z-modal rounded-md motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-change"
      />
      <Popover.Root open>
        <Popover.Anchor virtualRef={anchor} />
        <Popover.Portal>
          <Popover.Content
            side="bottom"
            align="start"
            sideOffset={PAD + 8}
            collisionPadding={16}
            data-tour-card=""
            aria-labelledby="tour-title"
            aria-describedby="tour-body"
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              next.current?.focus();
            }}
            onEscapeKeyDown={onSkip}
            onInteractOutside={(e) => e.preventDefault()}
            onFocusOutside={(e) => e.preventDefault()}
            className="z-dropdown w-[min(340px,calc(100vw-32px))] origin-[--radix-popover-content-transform-origin] rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-elevated motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-[.96] motion-safe:duration-change"
          >
            <p className="tm-label mb-1.5 text-tm-t3">
              <span className="tm-num">{String(index + 1).padStart(2, "0")}</span> / <span className="tm-num">{String(total).padStart(2, "0")}</span>
            </p>
            <h2 id="tour-title" className="mb-1 text-balance text-[15px] font-medium">{stop.title}</h2>
            <p id="tour-body" className="text-pretty text-[13px] leading-snug text-tm-t2">{stop.body}</p>
            <div className="mt-4 flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={onSkip} aria-keyshortcuts="Escape">
                Skip tour
              </Button>
              <Button ref={next} size="sm" onClick={onNext} aria-keyshortcuts="ArrowRight">
                {last ? "Done" : "Next"}
                {!last && <ArrowRight aria-hidden="true" />}
              </Button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </>
  );
}
