type Settings = Record<string, unknown>;

/**
 * Settings keys owned by the integration routes (validated, sealed). They must
 * never be written through generic settings endpoints or returned by them.
 */
export const PROTECTED_SETTINGS_KEYS = [
  "webhooks",
  "slackWebhookUrl",
  "slackChannelId",
  "linearApiKey",
  "linearTeamId",
] as const;

export const SECRET_WEBHOOK_FIELDS = ["secret", "secretSealed"] as const;

function asSettings(value: unknown): Settings {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Settings) : {};
}

/** Settings safe to return to clients: no credentials, webhook secrets removed. */
export function redactSettings(settings: unknown): Settings {
  const { webhooks, slackWebhookUrl: _s, slackChannelId: _c, linearApiKey: _k, ...rest } = asSettings(settings);
  if (!Array.isArray(webhooks)) return rest;

  return {
    ...rest,
    webhooks: webhooks.map((hook) => {
      const copy = { ...asSettings(hook) };
      for (const field of SECRET_WEBHOOK_FIELDS) delete copy[field];
      return copy;
    }),
  };
}

export function redactSettingsOf<T extends { settings?: unknown }>(entity: T): T {
  return { ...entity, settings: redactSettings(entity.settings) };
}

/** Keys only the server writes: the config schema version the dual-read fallback keys off. */
const SYSTEM_SETTINGS_KEYS = ["schemaVersion"] as const;

/**
 * The part of a generic settings PATCH that may be merged in: protected and system
 * keys are dropped, so their existing values stay as they are.
 */
export function userSettingsPatch(incoming: unknown): Settings {
  const next: Settings = { ...asSettings(incoming) };
  for (const key of [...PROTECTED_SETTINGS_KEYS, ...SYSTEM_SETTINGS_KEYS]) delete next[key];
  return next;
}
