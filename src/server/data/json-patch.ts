import { Prisma } from "@/generated/prisma/client";
import { defaultDb, type Db } from "./db";

export type SettingsPatch = Record<string, unknown>;

// Identifiers can't be bound parameters, so the target table comes from this fixed map.
const SETTINGS_TABLES = {
  project: Prisma.raw('"projects"'),
  workspace: Prisma.raw('"workspaces"'),
} as const;

export type SettingsOwner = keyof typeof SETTINGS_TABLES;

/** `(settings || $patch::jsonb) - $remove::text[]`: a shallow merge plus key removal, all bound parameters. */
export function jsonbMerge(patch: SettingsPatch, remove: string[] = []): Prisma.Sql {
  return Prisma.sql`(COALESCE("settings", '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb) - ${remove}::text[]`;
}

/**
 * Atomically merge `patch` into a row's settings and drop the `remove` keys, in one
 * UPDATE (`settings || $patch::jsonb - $remove::text[]`), so concurrent patches to
 * different keys never overwrite each other. The merge is shallow: a patched key
 * replaces its whole value. Returns false when the row does not exist.
 */
export async function patchSettingsJson(
  owner: SettingsOwner,
  id: string,
  patch: SettingsPatch,
  remove: string[] = [],
  db: Db = defaultDb
): Promise<boolean> {
  const count = await db.$executeRaw`
    UPDATE ${SETTINGS_TABLES[owner]}
    SET "settings" = ${jsonbMerge(patch, remove)},
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${id}::uuid`;
  return count > 0;
}
