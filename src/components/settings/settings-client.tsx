"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ProjectSettings } from "@/components/settings/project-settings";
import { EnvironmentSettings } from "@/components/settings/environment-settings";
import { SecretSettings } from "@/components/settings/secret-settings";
import { WorkspaceSettings } from "@/components/settings/workspace-settings";

interface SettingsClientProps {
  workspace: { id: string; name: string; slug: string } | null;
  project: { id: string; name: string; slug: string; repoUrl: string | null } | null;
  environments: Array<{
    id: string;
    name: string;
    type: string;
    url: string;
    isDefault: boolean;
  }>;
  secrets: Array<{
    id: string;
    key: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
}

const tabs = [
  { id: "project", label: "Project" },
  { id: "environments", label: "Environments" },
  { id: "secrets", label: "Secrets" },
  { id: "workspace", label: "Workspace" },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function SettingsClient({ workspace, project, environments, secrets }: SettingsClientProps) {
  const [activeTab, setActiveTab] = useState<TabId>("project");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your project, environments, and workspace configuration.
        </p>
      </div>

      <div className="flex gap-0.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-3.5 py-1.5 text-[13px] font-medium transition-colors rounded-md relative",
              activeTab === tab.id
                ? "text-foreground bg-white/[0.06]"
                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-[400px]">
        {activeTab === "project" && <ProjectSettings project={project} />}
        {activeTab === "environments" && (
          <EnvironmentSettings projectId={project?.id ?? null} environments={environments} />
        )}
        {activeTab === "secrets" && (
          <SecretSettings projectId={project?.id ?? null} secrets={secrets} />
        )}
        {activeTab === "workspace" && <WorkspaceSettings workspace={workspace} />}
      </div>
    </div>
  );
}
