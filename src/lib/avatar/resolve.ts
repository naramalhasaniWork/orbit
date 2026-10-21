/** The fields resolveAvatarUrl reads; select these wherever a person is loaded for display. */
export interface AvatarSource {
  id: string;
  image: string | null;
  avatarKey: string | null;
}

export const AVATAR_SOURCE_SELECT = { id: true, image: true, avatarKey: true } as const;

/** Storage key for an uploaded photo; the content hash doubles as the cache version and ETag. */
export function avatarStorageKey(userId: string, contentHash: string): string {
  return `avatars/${userId}/${contentHash}.webp`;
}

/** The content hash inside a storage key ("avatars/u/abc.webp" → "abc"). */
export function avatarVersion(avatarKey: string): string {
  const file = avatarKey.slice(avatarKey.lastIndexOf("/") + 1);
  return file.replace(/\.webp$/, "");
}

/** The served URL of a user's own uploaded photo. */
export function avatarRoute(userId: string, avatarKey: string): string {
  return `/api/users/${userId}/avatar?v=${avatarVersion(avatarKey)}`;
}

/** Uploaded photo, then the GitHub photo, then null (the Avatar draws initials). */
export function resolveAvatarUrl(user: AvatarSource): string | null {
  if (user.avatarKey) return avatarRoute(user.id, user.avatarKey);
  return user.image || null;
}

/** A person as the UI shows them: no ids or storage keys leave the server. */
export interface PersonView {
  name: string | null;
  email: string | null;
  image: string | null;
}

/** Select for a related user (triggeredBy, user, …) that toPersonView can render. */
export const PERSON_SELECT = { ...AVATAR_SOURCE_SELECT, name: true, email: true } as const;

export function toPersonView(user: AvatarSource & { name: string | null; email: string | null }): PersonView {
  return { name: user.name, email: user.email, image: resolveAvatarUrl(user) };
}
