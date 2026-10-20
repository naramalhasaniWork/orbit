"use client";

import { useState } from "react";
import { GitHubCard } from "@/components/settings/integration-github";
import { LinearCard } from "@/components/settings/integration-linear";
import { SlackCard } from "@/components/settings/integration-slack";
import { RailwayConnectCard } from "@/components/integrations/railway-connect";

interface IntegrationConfig {
  github?: {
    connected: boolean;
    installationId?: string;
    repos?: string[];
  };
  linear?: {
    connected: boolean;
    teamId?: string;
    teamName?: string;
    autoCreateIssues?: boolean;
  };
  slack?: {
    connected: boolean;
    notifications?: {
      runCompleted: boolean;
      testFailed: boolean;
    };
  };
  railway?: {
    connected: boolean;
    userName?: string;
    railwayProjectId?: string;
    railwayProjectName?: string;
    serviceCount?: number;
  };
}

interface IntegrationSettingsProps {
  workspaceId: string | null;
  projectId?: string | null;
  integrations: IntegrationConfig;
}

export function IntegrationSettings({ workspaceId, projectId, integrations: initial }: IntegrationSettingsProps) {
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

      <RailwayConnectCard
        workspaceId={workspaceId}
        projectId={projectId ?? null}
        config={integrations.railway}
        onUpdate={(cfg) => updateIntegration("railway", cfg)}
      />
    </div>
  );
}
