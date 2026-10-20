"use client";

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

// Grouped so General reads as one vertical sub-nav under the section tabs, not a second tab row.
const tabs = [
  { id: "project", label: "Project", group: "Project" },
  { id: "config", label: "Config", group: "Project" },
  { id: "environments", label: "Environments", group: "Project" },
  { id: "schedules", label: "Schedules", group: "Project" },
  { id: "secrets", label: "Secrets", group: "Project" },
  { id: "notes", label: "Notes", group: "Project" },
  { id: "agents", label: "Agents", group: "Agent" },
  { id: "knowledge", label: "Knowledge", group: "Agent" },
  { id: "integrations", label: "Integrations", group: "Connections" },
  { id: "webhooks", label: "Webhooks", group: "Connections" },
  { id: "api-keys", label: "API Keys", group: "Connections" },
  { id: "plugins", label: "Plugins", group: "Connections" },
  { id: "workspace", label: "Workspace", group: "Workspace" },
  { id: "audit", label: "Audit Log", group: "Workspace" },
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
    <div className="grid gap-6 md:grid-cols-[180px_minmax(0,1fr)]">
      <div className="md:hidden">
        <label htmlFor="settings-section" className="tm-label mb-1.5 block text-tm-t3">Section</label>
        <select
          id="settings-section"
          value={activeTab}
          onChange={(e) => setActiveTab(e.target.value as TabId)}
          className="h-9 w-full rounded-md border border-input bg-card px-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {tabs.map((t) => (
            <option key={t.id} value={t.id}>{t.group} · {t.label}</option>
          ))}
        </select>
      </div>

      <nav aria-label="General settings" className="hidden md:block">
        {Array.from(new Set(tabs.map((t) => t.group))).map((group) => (
          <div key={group} className="mb-4">
            <p className="tm-label mb-1 px-2 text-tm-t3">{group}</p>
            {tabs.filter((t) => t.group === group).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-current={activeTab === tab.id ? "page" : undefined}
                className={cn(
                  "flex h-8 w-full items-center rounded-md px-2 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  activeTab === tab.id ? "bg-accent font-medium text-foreground" : "text-tm-t2 hover:bg-accent hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="min-w-0">
        <div key={activeTab} className="min-h-[400px]">
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
        </div>
      </div>
    </div>
  );
}
