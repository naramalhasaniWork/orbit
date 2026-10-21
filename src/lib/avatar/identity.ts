/**
 * The fallback identity for a person or workspace without a photo: initials on a colour
 * picked from a stable hash, so the same person is the same colour on every screen.
 * Colours live as tokens in globals.css (--tm-avatar-<tone>-bg / -fg), light and dark.
 */

/** Warm, muted tones that sit beside the safety-orange accent. No blue, magenta or purple. */
export const AVATAR_TONES = ["clay", "ochre", "moss", "pine", "sage", "rust", "sand", "graphite"] as const;
export type AvatarTone = (typeof AVATAR_TONES)[number];

/** FNV-1a, 32-bit: tiny, stable across runtimes, well spread for short ids. */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Same seed, same tone. Seed with the user id when known, else the lower-cased email. */
export function avatarTone(seed: string): AvatarTone {
  return AVATAR_TONES[hashSeed(seed.trim().toLowerCase()) % AVATAR_TONES.length];
}

export function avatarToneStyle(tone: AvatarTone): { backgroundColor: string; color: string } {
  return { backgroundColor: `hsl(var(--tm-avatar-${tone}-bg))`, color: `hsl(var(--tm-avatar-${tone}-fg))` };
}

const WORD_START = /^[\p{L}\p{N}]/u;

/** First grapheme of a word, upper-cased; only words that start with a letter or digit count. */
function firstGlyph(word: string): string | null {
  if (!WORD_START.test(word)) return null;
  const glyph = Array.from(word)[0];
  return glyph.toLocaleUpperCase();
}

function fromWords(words: string[], max: number): string {
  const glyphs = words.map(firstGlyph).filter((g): g is string => g !== null);
  if (glyphs.length === 0) return "";
  if (max === 1 || glyphs.length === 1) return glyphs[0];
  return glyphs[0] + glyphs[glyphs.length - 1];
}

/**
 * "Ada Lovelace" → "AL", "Cher" → "C", "🚀 Rocket" → "R", "jane.doe@x.io" → "JD".
 * Emoji and punctuation are skipped; nothing usable gives "?".
 */
export function initialsFor(name: string | null | undefined, email?: string | null, max: 1 | 2 = 2): string {
  const fromName = fromWords((name ?? "").trim().split(/\s+/), max);
  if (fromName) return fromName;
  const local = (email ?? "").split("@")[0] ?? "";
  return fromWords(local.split(/[._+-]+/), max) || "?";
}
