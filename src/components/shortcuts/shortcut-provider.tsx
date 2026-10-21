"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createShortcutMatcher, isEditableTarget } from "@/lib/shortcuts/matcher";
import { SHORTCUT_ROUTES, type ShortcutId } from "@/lib/shortcuts/registry";
import { ShortcutsOverlay } from "@/components/shortcuts/shortcuts-overlay";

type Handler = () => void;

interface ShortcutContextValue {
  register: (id: ShortcutId, handler: Handler) => () => void;
  /** Run a registered action as if its keys were pressed. False when nothing is attached to it right now. */
  trigger: (id: ShortcutId) => boolean;
}

const ShortcutContext = createContext<ShortcutContextValue>({ register: () => () => {}, trigger: () => false });

const OPEN_DIALOG_SELECTOR = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]';

/** Keep the selected project when jumping between project-scoped pages (settings is workspace-wide). */
function withProject(route: string): string {
  const project = new URLSearchParams(window.location.search).get("project");
  return project && !route.includes("/settings") ? `${route}?project=${project}` : route;
}

/**
 * The one global keyboard listener. Navigation and the `?` overlay are handled here;
 * components that own an action (palette, run trigger) attach it with useShortcutAction.
 */
export function ShortcutProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  const handlers = useRef(new Map<ShortcutId, Handler>());

  const register = useCallback((id: ShortcutId, handler: Handler) => {
    handlers.current.set(id, handler);
    return () => {
      if (handlers.current.get(id) === handler) handlers.current.delete(id);
    };
  }, []);

  useEffect(() => {
    const match = createShortcutMatcher();

    function onKeyDown(e: KeyboardEvent) {
      const { id, consumed } = match(e, {
        editable: isEditableTarget(e.target),
        blocked: !!document.querySelector(OPEN_DIALOG_SELECTOR),
      });
      if (!consumed) return;
      if (!id) return; // first key of a chord
      e.preventDefault();

      if (id === "help") return setHelpOpen((open) => !open);
      const route = SHORTCUT_ROUTES[id];
      if (route) return router.push(withProject(route));
      handlers.current.get(id)?.();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  const trigger = useCallback((id: ShortcutId) => {
    const handler = handlers.current.get(id);
    handler?.();
    return handler !== undefined;
  }, []);
  const value = useMemo(() => ({ register, trigger }), [register, trigger]);

  return (
    <ShortcutContext.Provider value={value}>
      {children}
      <ShortcutsOverlay open={helpOpen} onOpenChange={setHelpOpen} />
    </ShortcutContext.Provider>
  );
}

/** Attach a handler to a registry shortcut for as long as the component is mounted. */
export function useShortcutAction(id: ShortcutId, handler: Handler | undefined) {
  const { register } = useContext(ShortcutContext);
  const latest = useRef(handler);
  latest.current = handler;
  const active = handler !== undefined;

  useEffect(() => {
    if (!active) return;
    return register(id, () => latest.current?.());
  }, [id, active, register]);
}

/** Fire a registered shortcut action from a button: the same gate and feedback as the keys. */
export function useShortcutTrigger(): (id: ShortcutId) => boolean {
  return useContext(ShortcutContext).trigger;
}
