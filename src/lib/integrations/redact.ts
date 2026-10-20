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

/**
 * Settings a generic PATCH may write: incoming protected keys are dropped and
 * the existing values are kept.
 */
export function mergeUserSettings(existing: unknown, incoming: Settings): Settings {
  const current = asSettings(existing);
  const next: Settings = { ...incoming };
  for (const key of PROTECTED_SETTINGS_KEYS) {
    delete next[key];
    if (key in current) next[key] = current[key];
  }
  return next;
}
