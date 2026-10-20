/**
 * Single source of truth for keyboard shortcuts. The global provider binds from this
 * list, the `?` overlay renders it, and the command palette reads its hints from it.
 */
export type ShortcutId =
  | "palette"
  | "help"
  | "sidebar"
  | "run"
  | "latest"
  | "map"
  | "settings"
  | "go-runs"
  | "go-plans"
  | "go-map"
  | "go-settings";

export type ShortcutGroup = "General" | "Actions" | "Go to";

export interface ShortcutDef {
  id: ShortcutId;
  /** One key, or two for a chord (`g` then `r`). Lowercase; `?` and `,` are literal. */
  keys: string[];
  /** Requires Cmd (macOS) or Ctrl. Works even while typing in a field. */
  mod?: boolean;
  label: string;
  group: ShortcutGroup;
}

export const SHORTCUTS: readonly ShortcutDef[] = [
  { id: "palette", keys: ["k"], mod: true, label: "Open command palette", group: "General" },
  { id: "help", keys: ["?"], label: "Show keyboard shortcuts", group: "General" },
  { id: "sidebar", keys: ["["], label: "Expand or collapse the sidebar", group: "General" },
  { id: "run", keys: ["r"], label: "Trigger test run", group: "Actions" },
  { id: "latest", keys: ["l"], label: "View latest results", group: "Actions" },
  { id: "map", keys: ["m"], label: "Open System Map", group: "Actions" },
  { id: "settings", keys: [","], label: "Open settings", group: "Actions" },
  { id: "go-runs", keys: ["g", "r"], label: "Go to Runs", group: "Go to" },
  { id: "go-plans", keys: ["g", "p"], label: "Go to Test Plans", group: "Go to" },
  { id: "go-map", keys: ["g", "m"], label: "Go to System Map", group: "Go to" },
  { id: "go-settings", keys: ["g", "s"], label: "Go to Settings", group: "Go to" },
];

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = ["General", "Actions", "Go to"];

/** Routes the navigation shortcuts open. */
export const SHORTCUT_ROUTES: Partial<Record<ShortcutId, string>> = {
  latest: "/dashboard/runs",
  map: "/dashboard/map",
  settings: "/dashboard/settings",
  "go-runs": "/dashboard/runs",
  "go-plans": "/dashboard/plans",
  "go-map": "/dashboard/map",
  "go-settings": "/dashboard/settings",
};

export function getShortcut(id: ShortcutId): ShortcutDef {
  const def = SHORTCUTS.find((s) => s.id === id);
  if (!def) throw new Error(`Unknown shortcut: ${id}`);
  return def;
}
