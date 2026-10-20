import { z } from "zod";
import { StoredSecretSchema } from "./secret";

const stringList = z.array(z.string()).optional().catch(undefined);

/** The GitHub card's display state (GitHub credentials live in GitHubInstallation). */
export const GitHubDisplaySchema = z
  .object({
    connected: z.boolean().default(false),
    installationId: z.string().optional(),
    repos: z.array(z.string()).optional(),
  })
  .passthrough();

/** Pre-W3 Linear card state; IntegrationConfig is the source of truth now. */
export const LegacyLinearDisplaySchema = z
  .object({
    connected: z.boolean().default(false),
    teamId: z.string().optional(),
    teamName: z.string().optional(),
    autoCreateIssues: z.boolean().optional(),
  })
  .passthrough();

/** Pre-W3 Slack card state; IntegrationConfig is the source of truth now. */
export const LegacySlackDisplaySchema = z
  .object({
    connected: z.boolean().default(false),
    notifications: z.object({ runCompleted: z.boolean(), testFailed: z.boolean() }).partial().optional(),
  })
  .passthrough();

/**
 * workspace.settings: prompt config and display prefs. Unknown keys pass through;
 * a malformed known key reads as unset.
 */
export const WorkspaceSettingsSchema = z
  .object({
    schemaVersion: z.number().int().default(1).catch(1),
    customPrompt: z.string().optional().catch(undefined),
    customRules: stringList,
    technologyContext: z.string().optional().catch(undefined),
    criticalPaths: stringList,
    excludePaths: stringList,
    finishSetupDismissed: z.boolean().optional().catch(undefined),
    github: GitHubDisplaySchema.optional().catch(undefined),
    /** Slack slash-command routing (written outside the integration routes). */
    slackTeamId: z.string().optional().catch(undefined),
    // Legacy (pre-W3): read by the dual-read fallback and the 20261025 backfill only
    linear: LegacyLinearDisplaySchema.optional().catch(undefined),
    slack: LegacySlackDisplaySchema.optional().catch(undefined),
    linearApiKey: StoredSecretSchema.optional().catch(undefined),
    linearTeamId: z.string().optional().catch(undefined),
    slackWebhookUrl: StoredSecretSchema.optional().catch(undefined),
  })
  .passthrough();
export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>;
