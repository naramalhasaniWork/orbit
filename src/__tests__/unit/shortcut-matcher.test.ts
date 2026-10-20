import { describe, it, expect } from "vitest";
import { createShortcutMatcher, isEditableTarget, type KeyInfo } from "@/lib/shortcuts/matcher";
import { SHORTCUTS } from "@/lib/shortcuts/registry";

const key = (k: string, extra: Partial<KeyInfo> = {}): KeyInfo => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  ...extra,
});
const free = { editable: false, blocked: false };

describe("shortcut registry", () => {
  it("has unique ids and no key collisions", () => {
    expect(new Set(SHORTCUTS.map((s) => s.id)).size).toBe(SHORTCUTS.length);
    const sigs = SHORTCUTS.map((s) => `${s.mod ? "mod+" : ""}${s.keys.join(" ")}`);
    expect(new Set(sigs).size).toBe(sigs.length);
  });

  it("does not bind a single key that is also a chord starter", () => {
    const starters = new Set(SHORTCUTS.filter((s) => s.keys.length === 2).map((s) => s.keys[0]));
    for (const s of SHORTCUTS) if (s.keys.length === 1 && !s.mod) expect(starters.has(s.keys[0])).toBe(false);
  });
});

describe("createShortcutMatcher", () => {
  it("matches the keys the palette advertises", () => {
    const m = createShortcutMatcher();
    expect(m(key("r"), free).id).toBe("run");
    expect(m(key("l"), free).id).toBe("latest");
    expect(m(key("m"), free).id).toBe("map");
    expect(m(key(","), free).id).toBe("settings");
    expect(m(key("?", { shiftKey: true }), free).id).toBe("help");
  });

  it("matches g-then-key chords", () => {
    const m = createShortcutMatcher();
    expect(m(key("g"), free)).toEqual({ id: null, consumed: true });
    expect(m(key("p"), free).id).toBe("go-plans");
    m(key("g"), free);
    expect(m(key("s"), free).id).toBe("go-settings");
  });

  it("expires a chord after the timeout", () => {
    let t = 0;
    const m = createShortcutMatcher(SHORTCUTS, () => t);
    m(key("g"), free);
    t = 5000;
    expect(m(key("r"), free).id).toBe("run");
  });

  it("a chord's second key does not fall through to the single-key binding", () => {
    const m = createShortcutMatcher();
    m(key("g"), free);
    expect(m(key("r"), free).id).toBe("go-runs");
  });

  it("ignores keys while typing or when a dialog is open", () => {
    const m = createShortcutMatcher();
    expect(m(key("r"), { editable: true, blocked: false })).toEqual({ id: null, consumed: false });
    expect(m(key("r"), { editable: false, blocked: true })).toEqual({ id: null, consumed: false });
  });

  it("typing g in a field does not arm a chord", () => {
    const m = createShortcutMatcher();
    m(key("g"), { editable: true, blocked: false });
    expect(m(key("p"), free).id).toBeNull();
  });

  it("leaves browser shortcuts alone", () => {
    const m = createShortcutMatcher();
    expect(m(key("r", { metaKey: true }), free).consumed).toBe(false); // Cmd+R reload
    expect(m(key("l", { ctrlKey: true }), free).consumed).toBe(false); // Ctrl+L address bar
    expect(m(key("m", { altKey: true }), free).consumed).toBe(false);
    expect(m(key("R", { shiftKey: true }), free).consumed).toBe(false);
  });

  it("opens the palette with Cmd/Ctrl+K even inside an input", () => {
    const m = createShortcutMatcher();
    const typing = { editable: true, blocked: true };
    expect(m(key("k", { metaKey: true }), typing).id).toBe("palette");
    expect(m(key("k", { ctrlKey: true }), typing).id).toBe("palette");
  });

  it("ignores key repeat", () => {
    const m = createShortcutMatcher();
    expect(m(key("r", { repeat: true }), free).consumed).toBe(false);
  });
});

describe("isEditableTarget", () => {
  const el = (tagName: string, attrs: Record<string, string> = {}, isContentEditable = false) => ({
    tagName,
    isContentEditable,
    getAttribute: (n: string) => attrs[n] ?? null,
  });

  it("detects form fields and contenteditable", () => {
    expect(isEditableTarget(el("INPUT"))).toBe(true);
    expect(isEditableTarget(el("TEXTAREA"))).toBe(true);
    expect(isEditableTarget(el("DIV", {}, true))).toBe(true);
    expect(isEditableTarget(el("DIV", { contenteditable: "" }))).toBe(true);
    expect(isEditableTarget(el("DIV", { role: "textbox" }))).toBe(true);
  });

  it("does not treat buttons, links or the body as editable", () => {
    expect(isEditableTarget(el("BUTTON"))).toBe(false);
    expect(isEditableTarget(el("A"))).toBe(false);
    expect(isEditableTarget(el("DIV", { contenteditable: "false" }))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
