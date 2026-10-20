import { Prisma, type IntegrationStatus } from "@/generated/prisma/client";
import { openSecret, sealSecret } from "@/lib/integrations/secret-field";
import { parseIntegrationSettings, type SettingsFor, type TypedProvider } from "@/server/domain/config";
import { defaultDb, type Db } from "./db";
import { jsonbMerge } from "./json-patch";
import { isTypedRow, legacyProjectOverride, legacyWorkspaceIntegration } from "./integration-legacy";
import { recordLegacyRead } from "./legacy-reads";
import { migrateWorkspaceIntegration } from "./legacy-migration";
import { readProjectSettings, readWorkspaceSettings } from "./settings-repo";

/** A workspace's connection to a provider, without its credentials. */
export interface IntegrationView<P extends TypedProvider> {
  provider: P;
  status: IntegrationStatus;
  connected: boolean;
  externalAccountId: string | null;
  displayName: string | null;
  settings: SettingsFor<P>;
}

interface LoadedIntegration<P extends TypedProvider> {
  view: IntegrationView<P>;
  sealed: unknown;
}

/** The typed row when it is authoritative (see isTypedRow), else the legacy workspace.settings keys. */
async function loadIntegration<P extends TypedProvider>(
  workspaceId: string,
  provider: P,
  db: Db
): Promise<LoadedIntegration<P> | null> {
  const row = await db.integrationConfig.findUnique({
    where: { integration_config_unique: { workspaceId, provider } },
    select: { status: true, externalAccountId: true, displayName: true, settings: true, credentialsSealed: true },
  });
  if (row && isTypedRow(row)) {
    const connected = row.status === "connected" && row.credentialsSealed !== null;
    return {
      view: {
        provider,
        status: row.status,
        connected,
        externalAccountId: row.externalAccountId,
        displayName: row.displayName,
        settings: parseIntegrationSettings(provider, row.settings),
      },
      sealed: connected ? row.credentialsSealed : null,
    };
  }

  const settings = await readWorkspaceSettings(workspaceId, db);
  const legacy = settings ? legacyWorkspaceIntegration(settings, provider) : null;
  if (!legacy) return null;
  recordLegacyRead(`workspace.${provider}`, { workspaceId });
  const { secret, ...rest } = legacy;
  return { view: { provider, status: "connected", connected: true, ...rest }, sealed: secret };
}

export async function getIntegration<P extends TypedProvider>(
  workspaceId: string,
  provider: P,
  db: Db = defaultDb
): Promise<IntegrationView<P> | null> {
  return (await loadIntegration(workspaceId, provider, db))?.view ?? null;
}

/** What a project's runs use for `provider`: legacy per-project overrides first, then the workspace's. */
export interface ResolvedIntegration<P extends TypedProvider> {
  workspaceId: string;
  secret: string | null;
  externalAccountId: string | null;
  settings: SettingsFor<P>;
}

export async function resolveProjectIntegration<P extends TypedProvider>(
  projectId: string,
  provider: P,
  db: Db = defaultDb
): Promise<ResolvedIntegration<P> | null> {
  const project = await readProjectSettings(projectId, db);
  if (!project) return null;
  const { workspaceId } = project;

  const workspace = await loadIntegration(workspaceId, provider, db);
  const override = legacyProjectOverride(project.settings, provider);
  if (override) recordLegacyRead(`project.${provider}`, { workspaceId, projectId });

  return {
    workspaceId,
    secret: openSecret(override?.secret) ?? (workspace ? openSecret(workspace.sealed) : null),
    externalAccountId: override?.externalAccountId ?? workspace?.view.externalAccountId ?? null,
    settings: workspace?.view.settings ?? parseIntegrationSettings(provider, {}),
  };
}

export interface ConnectInput<P extends TypedProvider> {
  secret: string;
  externalAccountId?: string | null;
  displayName?: string | null;
  settings?: Partial<Omit<SettingsFor<P>, "provider">>;
}

/** Connect (or reconnect) a provider: credentials are sealed, settings validated. */
export async function connectIntegration<P extends TypedProvider>(
  workspaceId: string,
  provider: P,
  input: ConnectInput<P>,
  db: Db = defaultDb
): Promise<IntegrationView<P>> {
  const settings = parseIntegrationSettings(provider, input.settings ?? {});
  const data = {
    status: "connected" as const,
    isEnabled: true,
    credentialsSealed: { ...sealSecret(input.secret) },
    externalAccountId: input.externalAccountId ?? null,
    displayName: input.displayName ?? null,
    settings: settings as Prisma.InputJsonValue,
  };
  await db.integrationConfig.upsert({
    where: { integration_config_unique: { workspaceId, provider } },
    create: { workspaceId, provider, ...data },
    update: data,
  });
  const { credentialsSealed: _sealed, isEnabled: _enabled, ...view } = data;
  return { provider, connected: true, ...view, settings };
}

/** Disconnect: the row stays as the record that the legacy keys no longer apply. */
export async function disconnectIntegration(workspaceId: string, provider: TypedProvider, db: Db = defaultDb) {
  const data = {
    status: "disconnected" as const,
    isEnabled: false,
    credentialsSealed: Prisma.DbNull,
    externalAccountId: null,
    displayName: null,
  };
  await db.integrationConfig.upsert({
    where: { integration_config_unique: { workspaceId, provider } },
    create: { workspaceId, provider, ...data },
    update: data,
  });
}

/**
 * Atomically merge `patch` into a connected integration's settings. Legacy
 * connections are copied into the table first. False when not connected.
 */
export async function patchIntegrationSettings<P extends TypedProvider>(
  workspaceId: string,
  provider: P,
  patch: Partial<Omit<SettingsFor<P>, "provider">>,
  db: Db = defaultDb
): Promise<boolean> {
  await migrateWorkspaceIntegration(workspaceId, provider, db);
  const count = await db.$executeRaw`
    UPDATE "integration_configs"
    SET "settings" = ${jsonbMerge(patch)}, "updated_at" = CURRENT_TIMESTAMP
    WHERE "workspace_id" = ${workspaceId}::uuid
      AND "provider" = ${provider}::"IntegrationProvider"
      AND "status" = 'connected'
      AND "credentials_sealed" IS NOT NULL`;
  return count > 0;
}
