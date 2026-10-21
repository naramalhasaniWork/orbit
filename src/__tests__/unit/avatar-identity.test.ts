import { describe, it, expect } from "vitest";
import { AVATAR_TONES, avatarTone, hashSeed, initialsFor } from "@/lib/avatar/identity";
import { avatarRoute, avatarStorageKey, avatarVersion, resolveAvatarUrl } from "@/lib/avatar/resolve";

describe("avatarTone", () => {
  it("is stable for the same seed and ignores case and whitespace", () => {
    expect(avatarTone("ada@example.com")).toBe(avatarTone("ada@example.com"));
    expect(avatarTone(" Ada@Example.com ")).toBe(avatarTone("ada@example.com"));
    // Pinned so a refactor of the hash cannot silently recolour everyone
    expect(hashSeed("ada@example.com")).toBe(3203780562);
    expect(avatarTone("ada@example.com")).toBe("moss");
    expect(hashSeed("")).toBe(0x811c9dc5);
  });

  it("always lands inside the palette and uses all of it", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const tone = avatarTone(`user-${i}@example.com`);
      expect(AVATAR_TONES).toContain(tone);
      seen.add(tone);
    }
    expect(seen.size).toBe(AVATAR_TONES.length);
  });
});

describe("initialsFor", () => {
  it("takes first and last word of a name", () => {
    expect(initialsFor("Ada Lovelace")).toBe("AL");
    expect(initialsFor("Ada King Lovelace")).toBe("AL");
    expect(initialsFor("  ada   lovelace ")).toBe("AL");
  });

  it("uses one letter for a single name or when asked for one", () => {
    expect(initialsFor("Cher")).toBe("C");
    expect(initialsFor("Ada Lovelace", null, 1)).toBe("A");
  });

  it("skips emoji and punctuation", () => {
    expect(initialsFor("🚀 Rocket Team")).toBe("RT");
    expect(initialsFor("(Ada)")).toBe("?");
    expect(initialsFor("🦄", "uni.corn@example.com")).toBe("UC");
    expect(initialsFor("Émile Zola")).toBe("ÉZ");
  });

  it("falls back to the email local part", () => {
    expect(initialsFor(null, "jane.doe@example.com")).toBe("JD");
    expect(initialsFor("", "jdoe@example.com")).toBe("J");
    expect(initialsFor(undefined, "first_last+tag@example.com")).toBe("FT");
  });

  it("returns ? when there is nothing to use", () => {
    expect(initialsFor(null, null)).toBe("?");
    expect(initialsFor("", "")).toBe("?");
  });
});

describe("resolveAvatarUrl", () => {
  const key = avatarStorageKey("u-1", "abc123");

  it("prefers the uploaded photo", () => {
    expect(resolveAvatarUrl({ id: "u-1", image: "https://avatars.githubusercontent.com/u/1", avatarKey: key })).toBe(
      "/api/users/u-1/avatar?v=abc123"
    );
  });

  it("falls back to the GitHub photo, then to none", () => {
    expect(resolveAvatarUrl({ id: "u-1", image: "https://avatars.githubusercontent.com/u/1", avatarKey: null })).toBe(
      "https://avatars.githubusercontent.com/u/1"
    );
    expect(resolveAvatarUrl({ id: "u-1", image: null, avatarKey: null })).toBeNull();
    expect(resolveAvatarUrl({ id: "u-1", image: "", avatarKey: null })).toBeNull();
  });

  it("versions the route by content hash", () => {
    expect(key).toBe("avatars/u-1/abc123.webp");
    expect(avatarVersion(key)).toBe("abc123");
    expect(avatarRoute("u-1", key)).toBe("/api/users/u-1/avatar?v=abc123");
  });
});
