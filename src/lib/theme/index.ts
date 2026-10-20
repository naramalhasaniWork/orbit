/** Theme preference. "system" follows prefers-color-scheme and is the default. */
export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "orbit-theme";
export const THEME_PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];

export function parsePreference(value: string | null | undefined): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveTheme(pref: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (pref === "system") return systemDark ? "dark" : "light";
  return pref;
}

/** Next preference when the toggle is pressed: system → light → dark → system. */
export function nextPreference(pref: ThemePreference): ThemePreference {
  const i = THEME_PREFERENCES.indexOf(pref);
  return THEME_PREFERENCES[(i + 1) % THEME_PREFERENCES.length];
}

/**
 * Inline <head> script: paints the right theme before hydration so there is no flash.
 * Kept dependency-free and tiny; it must not throw (storage can be blocked).
 */
export const themeInitScript = `(function(){try{var p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});var d=p==="dark"||(p!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light"}catch(_){}})();`;
