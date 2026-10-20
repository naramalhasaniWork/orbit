import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

type Settings = Record<string, unknown>;

export async function readWorkspaceSettings(workspaceId: string): Promise<Settings | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { settings: true },
  });
  if (!workspace) return null;
  return (workspace.settings ?? {}) as Settings;
}

/** Merge `set` into workspace settings and drop the keys in `remove`. */
export async function patchWorkspaceSettings(
  workspaceId: string,
  set: Settings,
  remove: string[] = []
): Promise<Settings | null> {
  const current = await readWorkspaceSettings(workspaceId);
  if (!current) return null;

  const next: Settings = { ...current, ...set };
  for (const key of remove) delete next[key];

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { settings: next as Prisma.InputJsonValue },
  });
  return next;
}
