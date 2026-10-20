import { SHORTCUTS, type ShortcutDef, type ShortcutId } from "./registry";

export interface KeyInfo {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
}

export interface KeyContext {
  /** Focus is in an input, textarea, select or contenteditable. */
  editable: boolean;
  /** A modal dialog is open, so page-level keys should stay out of its way. */
  blocked: boolean;
}

export interface MatchResult {
  id: ShortcutId | null;
  /** True when the key was used (a match, or the first key of a chord). */
  consumed: boolean;
}

const CHORD_TIMEOUT_MS = 1200;
const NONE: MatchResult = { id: null, consumed: false };

interface ElementLike {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
}

const EDITABLE_ROLES = new Set(["textbox", "combobox", "searchbox", "spinbutton"]);

export function isEditableTarget(target: unknown): boolean {
  const el = target as ElementLike | null;
  if (!el || typeof el !== "object") return false;
  const tag = el.tagName?.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  const editable = el.getAttribute?.("contenteditable");
  if (editable !== null && editable !== undefined && editable !== "false") return true;
  const role = el.getAttribute?.("role");
  return !!role && EDITABLE_ROLES.has(role);
}

/**
 * Stateful matcher for single keys and two-key chords. Holds only the pending first key
 * of a chord; the caller supplies focus context on every event.
 */
export function createShortcutMatcher(
  defs: readonly ShortcutDef[] = SHORTCUTS,
  now: () => number = Date.now
) {
  const chordStarters = new Set(defs.filter((d) => d.keys.length === 2).map((d) => d.keys[0]));
  let pending: { key: string; at: number } | null = null;

  return function match(e: KeyInfo, ctx: KeyContext): MatchResult {
    if (e.repeat) return NONE;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    // Cmd/Ctrl combos fire from anywhere, including text fields.
    if ((e.metaKey || e.ctrlKey) && !e.altKey) {
      pending = null;
      const def = defs.find((d) => d.mod && d.keys[0] === key);
      return def ? { id: def.id, consumed: true } : NONE;
    }

    if (e.metaKey || e.ctrlKey || e.altKey || ctx.editable || ctx.blocked) {
      pending = null;
      return NONE;
    }
    // Shift only counts for characters that need it (`?`); Shift+R is not "r".
    if (e.shiftKey && key !== "?") {
      pending = null;
      return NONE;
    }

    if (pending) {
      const first = pending;
      pending = null;
      if (now() - first.at <= CHORD_TIMEOUT_MS) {
        const def = defs.find((d) => !d.mod && d.keys.length === 2 && d.keys[0] === first.key && d.keys[1] === key);
        if (def) return { id: def.id, consumed: true };
      }
    }

    if (chordStarters.has(key)) {
      pending = { key, at: now() };
      return { id: null, consumed: true };
    }

    const def = defs.find((d) => !d.mod && d.keys.length === 1 && d.keys[0] === key);
    return def ? { id: def.id, consumed: true } : NONE;
  };
}
