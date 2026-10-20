"use client";

import { motion, AnimatePresence } from "framer-motion";
import { tween } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useUrlParams } from "@/hooks/use-url-state";
import { ProjectSettings } from "@/components/settings/project-settings";
import { EnvironmentSettings } from "@/components/settings/environment-settings";
import { SecretSettings } from "@/components/settings/secret-settings";
import { WorkspaceSettings } from "@/components/settings/workspace-settings";
import { ConfigEditor } from "@/components/settings/config-editor";
import { ScheduleSettings } from "@/components/settings/schedule-settings";
import { IntegrationSettings } from "@/components/settings/integration-settings";
import type { PreviewConnectionState } from "@/components/integrations/preview/preview-provider-card";
import { PreviewSourceSettings } from "@/components/integrations/preview/preview-source-settings";
import { ApiKeySettings } from "@/components/settings/api-key-settings";
import { WebhookSettings } from "@/components/settings/webhook-settings";
import { PluginSettings } from "@/components/settings/plugin-settings";
import { AuditLogViewer } from "@/components/audit/audit-log-viewer";
import { KnowledgeUpload } from "@/components/settings/knowledge-upload";
import { AgentSettingsList } from "@/components/settings/agent-settings-list";
import { TestingNotes } from "@/components/settings/testing-notes";

interface IntegrationConfig {
  github?: { connected: boolean; installationId?: string; repos?: string[] };
  linear?: { connected: boolean; teamId?: string; teamName?: string; autoCreateIssues?: boolean };
  slack?: {
    connected: boolean;
    notifications?: {
      runCompleted: boolean;
      testFailed: boolean;
    };
  };
}

interface SettingsClientProps {
  workspace: { id: string; name: string; slug: string } | null;
  project: { id: string; name: string; slug: string; repoUrl: string | null } | null;
  environments: Array<{
    id: string;
    name: string;
    type: string;
    url: string;
    isDefault: boolean;
    defaultRunMode: string;
  }>;
  secrets: Array<{
    id: string;
    key: string;
    environmentId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  integrations?: IntegrationConfig;
  previewConnections?: Record<string, PreviewConnectionState>;
  role?: string | null;
}

const tabs = [
  { id: "project", label: "Project" },
  { id: "config", label: "Config" },
  { id: "environments", label: "Environments" },
  { id: "schedules", label: "Schedules" },
  { id: "secrets", label: "Secrets" },
  { id: "notes", label: "Notes" },
  { id: "agents", label: "Agents" },
  { id: "knowledge", label: "Knowledge" },
  { id: "integrations", label: "Integrations" },
  { id: "webhooks", label: "Webhooks" },
  { id: "api-keys", label: "API Keys" },
  { id: "plugins", label: "Plugins" },
  { id: "workspace", label: "Workspace" },
  { id: "audit", label: "Audit Log" },
] as const;

type TabId = (typeof tabs)[number]["id"];

const URL_DEFAULTS = { tab: "project" };

export function SettingsClient({
  workspace,
  project,
  environments,
  secrets,
  integrations,
  previewConnections = {},
  role = null,
}: SettingsClientProps) {
  // The tab is in the URL (?tab=) so reload and shared links open the same one.
  const [{ tab }, setUrlParams] = useUrlParams(URL_DEFAULTS);
  const activeTab: TabId = tabs.find((t) => t.id === tab)?.id ?? "project";
  const setActiveTab = (id: TabId) => setUrlParams({ tab: id });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your project, environments, and workspace configuration.
        </p>
      </div>

      <div className="flex gap-0.5 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-3.5 py-1.5 text-[13px] font-medium transition-colors rounded-md relative whitespace-nowrap",
              activeTab === tab.id
                ? "text-foreground bg-foreground/[0.06]"
                : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.03]"
            )}
          >
            {activeTab === tab.id && (
              <motion.div
                layoutId="settings-tab-indicator"
                className="absolute inset-0 rounded-md bg-foreground/[0.06]"
                transition={tween.change}
              />
            )}
            <span className="relative">{tab.label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
          className="min-h-[400px]"
        >
          {activeTab === "project" && <ProjectSettings project={project} />}
          {activeTab === "config" && <ConfigEditor projectId={project?.id ?? null} />}
          {activeTab === "environments" && (
            <div className="space-y-4">
              <EnvironmentSettings projectId={project?.id ?? null} environments={environments} />
              {project && (
                <PreviewSourceSettings projectId={project.id} onOpenIntegrations={() => setActiveTab("integrations")} />
              )}
            </div>
          )}
          {activeTab === "schedules" && (
            <ScheduleSettings projectId={project?.id ?? null} />
          )}
          {activeTab === "secrets" && (
            <SecretSettings projectId={project?.id ?? null} secrets={secrets} environments={environments} />
          )}
          {activeTab === "notes" && (
            <TestingNotes projectId={project?.id ?? null} />
          )}
          {activeTab === "agents" && workspace && (
            <AgentSettingsList workspaceId={workspace.id} />
          )}
          {activeTab === "knowledge" && workspace && (
            <KnowledgeUpload workspaceId={workspace.id} />
          )}
          {activeTab === "integrations" && (
            <IntegrationSettings
              workspaceId={workspace?.id ?? null}
              integrations={integrations ?? {}}
              previewConnections={previewConnections}
            />
          )}
          {activeTab === "webhooks" && (
            <WebhookSettings projectId={project?.id ?? null} />
          )}
          {activeTab === "api-keys" && (
            <ApiKeySettings workspaceId={workspace?.id ?? null} />
          )}
          {activeTab === "plugins" && (
            <PluginSettings workspaceId={workspace?.id ?? null} />
          )}
          {activeTab === "workspace" && <WorkspaceSettings workspace={workspace} role={role} />}
          {activeTab === "audit" && workspace && <AuditLogViewer workspaceId={workspace.id} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
