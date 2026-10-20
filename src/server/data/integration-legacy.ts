import {
  parseIntegrationSettings,
  type ProjectSettings,
  type SettingsFor,
  type TypedProvider,
  type WorkspaceSettings,
} from "@/server/domain/config";

/**
 * An IntegrationConfig row is the source of truth once it holds credentials or records
 * a disconnect. Rows from before W3 (seeded config only) still defer to the legacy keys.
 */
export function isTypedRow(row: { credentialsSealed: unknown; status: string }): boolean {
  return row.credentialsSealed !== null || row.status === "disconnected";
}

/** A Linear/Slack connection as pre-W3 workspace.settings stored it. */
export interface LegacyIntegration<P extends TypedProvider> {
  /** Sealed payload or legacy plaintext. */
  secret: unknown;
  externalAccountId: string | null;
  displayName: string | null;
  settings: SettingsFor<P>;
}

export function legacyWorkspaceIntegration<P extends TypedProvider>(
  settings: WorkspaceSettings,
  provider: P
): LegacyIntegration<P> | null {
  if (provider === "linear") {
    if (!settings.linearApiKey) return null;
    return {
      secret: settings.linearApiKey,
      externalAccountId: settings.linearTeamId ?? settings.linear?.teamId ?? null,
      displayName: settings.linear?.teamName ?? null,
      settings: parseIntegrationSettings(provider, { autoCreateIssues: settings.linear?.autoCreateIssues }),
    };
  }
  if (!settings.slackWebhookUrl) return null;
  return {
    secret: settings.slackWebhookUrl,
    externalAccountId: null,
    displayName: null,
    settings: parseIntegrationSettings(provider, { notifications: settings.slack?.notifications ?? {} }),
  };
}

/**
 * Pre-W3 per-project overrides (project.settings.linearApiKey / linearTeamId /
 * slackWebhookUrl). Each part overrides the workspace's independently, as before.
 */
export interface ProjectOverride {
  secret: unknown;
  externalAccountId: string | null;
}

export function legacyProjectOverride(settings: ProjectSettings, provider: TypedProvider): ProjectOverride | null {
  const secret = provider === "linear" ? settings.linearApiKey : settings.slackWebhookUrl;
  const externalAccountId = provider === "linear" ? settings.linearTeamId ?? null : null;
  return secret || externalAccountId ? { secret: secret ?? null, externalAccountId } : null;
}
