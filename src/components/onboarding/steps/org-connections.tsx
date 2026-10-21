"use client";

import { Building2, CheckCircle2, Plus } from "lucide-react";

export interface OrgInfo {
  login: string;
  id: number;
  avatarUrl: string;
  description: string | null;
  installed: boolean;
}

export interface OrgData {
  orgs: OrgInfo[];
  appConfigured: boolean;
  installUrl: string | null;
}

interface OrgConnectionsProps {
  orgs: OrgInfo[];
  onConnect: () => void;
}

export function OrgConnections({ orgs, onConnect }: OrgConnectionsProps) {
  const installed = orgs.filter((o) => o.installed);
  const uninstalled = orgs.filter((o) => !o.installed);

  return (
    <div className="w-full mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className=" text-muted-foreground tm-label">
          Organizations
        </span>
        <button
          type="button"
          onClick={onConnect}
          className="text-xs text-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Connect organization
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {installed.map((org) => (
          <span
            key={org.id}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-border text-xs text-tm-pass"
          >
            {org.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={org.avatarUrl} alt="" className="h-3.5 w-3.5 rounded-full" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            {org.login}
          </span>
        ))}

        {uninstalled.map((org) => (
          <button
            key={org.id}
            type="button"
            onClick={onConnect}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-dashed border-tm-line-strong text-xs text-tm-t2 hover:text-foreground hover:bg-accent transition-colors"
          >
            {org.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={org.avatarUrl} alt="" className="h-3.5 w-3.5 rounded-full opacity-50" />
            ) : (
              <Building2 className="h-3 w-3" />
            )}
            {org.login}
            <Plus className="h-2.5 w-2.5" />
          </button>
        ))}

        {orgs.length === 0 && (
          <button
            type="button"
            onClick={onConnect}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-muted-foreground/30 text-xs text-muted-foreground hover:text-foreground hover:border-tm-line-strong transition-colors"
          >
            <Building2 className="h-3.5 w-3.5" />
            Connect an organization
          </button>
        )}
      </div>
    </div>
  );
}
