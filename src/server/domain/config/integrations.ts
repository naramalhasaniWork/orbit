import { z } from "zod";

export const INTEGRATION_SETTINGS_VERSION = 1;

const base = {
  schemaVersion: z.number().int().default(INTEGRATION_SETTINGS_VERSION).catch(INTEGRATION_SETTINGS_VERSION),
  lastError: z.string().optional().catch(undefined),
  lastErrorAt: z.string().optional().catch(undefined),
};

export const LinearSettingsSchema = z
  .object({
    provider: z.literal("linear"),
    ...base,
    /** File issues for critical/high failures. Unset keeps the pre-toggle behaviour (on). */
    autoCreateIssues: z.boolean().default(true).catch(true),
    /** Project that runs triggered by the inbound Linear webhook belong to. */
    inboundProjectId: z.string().uuid().nullable().optional().catch(undefined),
  })
  .passthrough();

export const SlackNotificationsSchema = z.object({
  runCompleted: z.boolean().default(true),
  testFailed: z.boolean().default(true),
});

export const SlackSettingsSchema = z
  .object({
    provider: z.literal("slack"),
    ...base,
    notifications: SlackNotificationsSchema.default({}).catch({ runCompleted: true, testFailed: true }),
    /** When the pending `/orbit link` code (hash in inboundTokenHash) stops working. */
    linkCodeExpiresAt: z.string().nullable().optional().catch(undefined),
    /** A Slack team that linked here while another Orbit workspace holds it; the holder's admin must approve. */
    pendingTeamId: z.string().nullable().optional().catch(undefined),
    /** When the claim was made; it lapses after 24 hours. */
    pendingTeamAt: z.string().nullable().optional().catch(undefined),
  })
  .passthrough();

/** IntegrationConfig.settings, discriminated by provider. */
export const IntegrationSettingsSchema = z.discriminatedUnion("provider", [
  LinearSettingsSchema,
  SlackSettingsSchema,
]);
export type IntegrationSettings = z.infer<typeof IntegrationSettingsSchema>;
export type TypedProvider = IntegrationSettings["provider"];
export type SettingsFor<P extends TypedProvider> = Extract<IntegrationSettings, { provider: P }>;
export type SlackNotifications = z.infer<typeof SlackNotificationsSchema>;

/** Parse stored settings for `provider`, falling back to that provider's defaults. */
export function parseIntegrationSettings<P extends TypedProvider>(provider: P, raw: unknown): SettingsFor<P> {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const parsed = IntegrationSettingsSchema.safeParse({ ...input, provider });
  if (parsed.success) return parsed.data as SettingsFor<P>;
  return IntegrationSettingsSchema.parse({ provider }) as SettingsFor<P>;
}
