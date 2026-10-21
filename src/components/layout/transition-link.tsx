"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, MouseEvent } from "react";
import { useReducedMotionSafe } from "@/lib/motion";
import { beginSharedNavigation, viewTransitionStarter, waitFor } from "@/lib/view-transition";

interface TransitionLinkProps extends ComponentProps<typeof Link> {
  href: string;
  /** The view-transition name this link hands to the destination (`sharedName("run", id)`). */
  shared: string;
}

/** Plain left clicks only: new tabs, downloads and modified clicks keep the browser's behaviour. */
function isPlainClick(e: MouseEvent<HTMLAnchorElement>): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.defaultPrevented;
}

/**
 * A Link whose `[data-vt-source]` child (or the link itself) morphs into the destination element
 * that carries the same shared name. Without the View Transitions API, or under reduced motion,
 * it is an ordinary Link and RouteTransition plays the plain entrance.
 */
export function TransitionLink({ href, shared, onClick, children, ...rest }: TransitionLinkProps) {
  const router = useRouter();
  const reduced = useReducedMotionSafe();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    const start = viewTransitionStarter(typeof document === "undefined" ? null : document, reduced);
    if (!start || !isPlainClick(e) || e.currentTarget.target === "_blank") return;
    e.preventDefault();

    const source = e.currentTarget.querySelector<HTMLElement>("[data-vt-source]") ?? e.currentTarget;
    source.style.viewTransitionName = shared;
    const transition = start(async () => {
      // Hand the name over: from here on only the destination carries it.
      source.style.viewTransitionName = "";
      const committed = beginSharedNavigation();
      router.push(href);
      await committed;
      await waitFor(() => document.querySelector(`[data-vt="${CSS.escape(shared)}"]`));
    });
    transition.finished.catch(() => undefined);
  };

  return (
    <Link href={href} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
}
