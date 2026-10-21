import { AVATAR_SOURCE_SELECT, type AvatarSource } from "@/lib/avatar/resolve";
import { defaultDb, type Db } from "./db";

export async function getAvatarSource(userId: string, db: Db = defaultDb): Promise<AvatarSource | null> {
  return db.user.findUnique({ where: { id: userId }, select: AVATAR_SOURCE_SELECT });
}

export async function getAvatarKey(userId: string, db: Db = defaultDb): Promise<string | null> {
  return (await getAvatarSource(userId, db))?.avatarKey ?? null;
}

/** Sets (or clears, with null) the uploaded photo; returns the key it replaced. */
export async function setAvatarKey(userId: string, avatarKey: string | null, db: Db = defaultDb): Promise<string | null> {
  const previous = await getAvatarKey(userId, db);
  await db.user.update({ where: { id: userId }, data: { avatarKey } });
  return previous;
}

/** A photo is visible to its owner and to anyone sharing a live workspace with them. */
export async function canSeeAvatar(viewerId: string, ownerId: string, db: Db = defaultDb): Promise<boolean> {
  if (viewerId === ownerId) return true;
  const shared = await db.workspaceMember.findFirst({
    where: { userId: ownerId, workspace: { deletedAt: null, members: { some: { userId: viewerId } } } },
    select: { id: true },
  });
  return shared !== null;
}
