import { z } from "zod";
import { SealedSecretSchema, StoredSecretSchema } from "./secret";

/**
 * schemaVersion 2: testing notes and webhooks live in ProjectNote / WebhookEndpoint.
 * Below 2, readers fall back to the legacy `testingNotes` / `webhooks` keys.
 */
export const PROJECT_SETTINGS_VERSION = 2;

export const NOTE_CATEGORIES = ["context", "instruction", "known-issue", "credential-hint"] as const;
export type NoteCategory = (typeof NOTE_CATEGORIES)[number];

const stringList = z.array(z.string()).optional().catch(undefined);

/**
 * project.settings. Unknown keys pass through; a malformed known key reads as
 * unset instead of failing the whole object.
 */
export const ProjectSettingsSchema = z
  .object({
    schemaVersion: z.number().int().default(1).catch(1),
    // Testing config
    autoSync: z.boolean().optional().catch(undefined),
    criticalPaths: stringList,
    excludePaths: stringList,
    // Written by the commit poller
    lastCommitSha: z.string().optional().catch(undefined),
    lastCommitAt: z.string().optional().catch(undefined),
    lastCommitMessage: z.string().optional().catch(undefined),
    commitsBehind: z.number().optional().catch(undefined),
    // Written by the system map builder
    lastSyncDiff: z
      .object({ added: z.number(), modified: z.number(), removed: z.number(), syncedAt: z.string().optional() })
      .passthrough()
      .optional()
      .catch(undefined),
    // Legacy (pre-W3): read by the dual-read fallback and the 20261025 backfill only
    testingNotes: z.array(z.unknown()).optional().catch(undefined),
    webhooks: z.array(z.unknown()).optional().catch(undefined),
    linearApiKey: StoredSecretSchema.optional().catch(undefined),
    linearTeamId: z.string().optional().catch(undefined),
    slackWebhookUrl: StoredSecretSchema.optional().catch(undefined),
  })
  .passthrough();
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

export const LegacyNoteSchema = z.object({
  id: z.string().optional(),
  content: z.string(),
  category: z.enum(NOTE_CATEGORIES).catch("context"),
  active: z.boolean().default(true),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type LegacyNote = z.infer<typeof LegacyNoteSchema>;

export const LegacyWebhookSchema = z.object({
  id: z.string().optional(),
  url: z.string(),
  events: z.array(z.string()).default([]),
  enabled: z.boolean().optional(),
  /** Plaintext secret from before sealing. */
  secret: z.string().optional(),
  secretSealed: SealedSecretSchema.optional(),
});
export type LegacyWebhook = z.infer<typeof LegacyWebhookSchema>;

/** The valid entries of a legacy list; malformed ones are skipped, not fatal. */
export function parseLegacyList<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, list: unknown[] | undefined): T[] {
  return (list ?? []).flatMap((item) => {
    const parsed = schema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}
