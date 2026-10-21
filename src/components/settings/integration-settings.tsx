"use client";

import { useState } from "react";
import { GitHubCard } from "@/components/settings/integration-github";
import { LinearCard, type LinearConfig } from "@/components/settings/integration-linear";
import { SlackCard, type SlackConfig } from "@/components/settings/integration-slack";
import {
  PreviewProviderCard,
  type PreviewConnectionState,
} from "@/components/integrations/preview/preview-provider-card";
import { PREVIEW_PROVIDER_CATALOG } from "@/services/preview/catalog";

interface IntegrationConfig {
  github?: {
    connected: boolean;
    installationId?: string;
    repos?: string[];
  };
  linear?: LinearConfig;
  slack?: SlackConfig;
}

interface IntegrationSettingsProps {
  workspaceId: string | null;
  integrations: IntegrationConfig;
  previewConnections: Record<string, PreviewConnectionState>;
}

export function IntegrationSettings({ workspaceId, integrations: initial, previewConnections }: IntegrationSettingsProps) {
  const [integrations, setIntegrations] = useState(initial);

  if (!workspaceId) {
    return (
      <div className="rounded-xl surface-1 p-8 text-center">
        <p className="text-sm text-muted-foreground">No workspace found.</p>
      </div>
    );
  }

  function updateIntegration(key: keyof IntegrationConfig, value: Partial<IntegrationConfig[typeof key]>) {
    setIntegrations((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...value },
    }));
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Connect external services to enable automated reporting, issue tracking, and notifications.
      </p>

      <GitHubCard
        workspaceId={workspaceId}
        config={integrations.github}
        onUpdate={(cfg) => updateIntegration("github", cfg)}
      />

      <div data-tour="integrations" className="space-y-4">
        <LinearCard
          workspaceId={workspaceId}
          config={integrations.linear}
          onUpdate={(cfg) => updateIntegration("linear", cfg)}
        />

        <SlackCard
          workspaceId={workspaceId}
          config={integrations.slack}
          onUpdate={(cfg) => updateIntegration("slack", cfg)}
        />
      </div>

      <h2 className="pt-4 tm-label text-muted-foreground">Preview deployments</h2>
      <p className="text-xs text-muted-foreground text-pretty -mt-2">
        Connect where your PR previews are deployed. Orbit waits for each PR&apos;s preview, tests it, and reports on the PR.
      </p>
      {PREVIEW_PROVIDER_CATALOG.map((info) => (
        <PreviewProviderCard
          key={info.id}
          info={info}
          initial={previewConnections[info.id] ?? { connection: null, webhookUrl: null }}
        />
      ))}
    </div>
  );
}
