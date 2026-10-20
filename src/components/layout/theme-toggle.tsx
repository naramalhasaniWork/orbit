"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  nextPreference,
  parsePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

const ICONS = { system: Monitor, light: Sun, dark: Moon };
const WORDS = { system: "System theme", light: "Light theme", dark: "Dark theme" };

function apply(pref: ThemePreference) {
  const dark = resolveTheme(pref, matchMedia("(prefers-color-scheme: dark)").matches) === "dark";
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

/** Cycles system → light → dark. The pre-hydration script already painted the stored choice. */
export function ThemeToggle({ className, showLabel = false }: { className?: string; showLabel?: boolean }) {
  const [pref, setPref] = useState<ThemePreference>("system");

  // Read the stored preference after mount (storage is client-only).
  useEffect(() => {
    try {
      setPref(parsePreference(localStorage.getItem(THEME_STORAGE_KEY)));
    } catch {
      // Storage blocked: stay on system.
    }
  }, []);

  // While following the system, follow its changes too.
  useEffect(() => {
    if (pref !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  function cycle() {
    const next = nextPreference(pref);
    setPref(next);
    apply(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Not persisted; still applied for this page.
    }
  }

  const Icon = ICONS[pref];
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`${WORDS[pref]}. Switch theme`}
      title={WORDS[pref]}
      className={cn(
        "flex h-9 items-center gap-2 rounded-md px-2.5 text-[13px] text-tm-t2 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        !showLabel && "w-9 justify-center px-0",
        className
      )}
    >
      <Icon aria-hidden="true" className="size-4" strokeWidth={1.6} />
      {showLabel && <span>{WORDS[pref]}</span>}
    </button>
  );
}
