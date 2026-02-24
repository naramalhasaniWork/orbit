"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import {
  Search, Star, Lock, Globe, ChevronRight, Loader2,
  AlertCircle, GitBranch, Building2, CheckCircle2, Plus,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { RepoItem } from "../onboarding-types";

type RepoProvider = "github" | "gitlab" | "bitbucket";

const PROVIDER_CONFIG: Record<RepoProvider, { label: string; color: string }> = {
  github: { label: "GitHub", color: "bg-muted/60" },
  gitlab: { label: "GitLab", color: "bg-orange-500/10" },
  bitbucket: { label: "Bitbucket", color: "bg-blue-500/10" },
};

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "bg-blue-400",
  JavaScript: "bg-yellow-300",
  Go: "bg-cyan-400",
  Python: "bg-yellow-400",
  Rust: "bg-orange-400",
  Ruby: "bg-red-400",
  Java: "bg-amber-600",
  Unknown: "bg-gray-400",
};

interface ConnectRepoProps {
  onSelect: (repo: RepoItem, projectId: string) => void;
}

interface OrgInfo {
  login: string;
  id: number;
  avatarUrl: string;
  description: string | null;
  installed: boolean;
}

interface OrgData {
  orgs: OrgInfo[];
  appConfigured: boolean;
  installUrl: string | null;
}

function formatUpdatedAt(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

export function ConnectRepo({ onSelect }: ConnectRepoProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [provider, setProvider] = useState<RepoProvider>("github");
  const [orgData, setOrgData] = useState<OrgData | null>(null);
  const [justConnectedOrg, setJustConnectedOrg] = useState<string | null>(null);

  const fetchRepos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/user/repos?per_page=50&provider=${provider}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? "Failed to fetch repositories");
        return;
      }
      setRepos(json.data);
    } catch {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  }, [provider]);

  const fetchOrgs = useCallback(async () => {
    try {
      const res = await fetch("/api/user/orgs");
      const json = await res.json();
      if (res.ok && json.success) {
        setOrgData(json.data);
      }
    } catch {
      // Non-critical
    }
  }, []);

  // Detect return from GitHub App installation
  useEffect(() => {
    const orgConnected = searchParams.get("org_connected");
    if (orgConnected) {
      setJustConnectedOrg(orgConnected);
      // Clean URL without reload
      const url = new URL(window.location.href);
      url.searchParams.delete("org_connected");
      window.history.replaceState({}, "", url.toString());
      // Refresh data to pick up new org repos
      fetchRepos();
      fetchOrgs();
    }
  }, [searchParams, fetchRepos, fetchOrgs]);

  useEffect(() => {
    fetchRepos();
    fetchOrgs();
  }, [fetchRepos, fetchOrgs]);

  // Auto-dismiss success banner after 5s
  useEffect(() => {
    if (!justConnectedOrg) return;
    const t = setTimeout(() => setJustConnectedOrg(null), 5000);
    return () => clearTimeout(t);
  }, [justConnectedOrg]);

  const filtered = useMemo(() => {
    if (!query.trim()) return repos;
    const lower = query.toLowerCase();
    return repos.filter(
      (r) =>
        r.name.toLowerCase().includes(lower) ||
        r.fullName.toLowerCase().includes(lower) ||
        r.language.toLowerCase().includes(lower)
    );
  }, [query, repos]);

  const selected = repos.find((r) => r.id === selectedId);

  const installedOrgs = orgData?.orgs.filter((o) => o.installed) ?? [];
  const uninstalledOrgs = orgData?.orgs.filter((o) => !o.installed) ?? [];
  const showOrgSection = orgData?.appConfigured === true;

  const handleContinue = async () => {
    if (!selected) return;
    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selected.name,
          repoUrl: selected.url,
          repoOwner: selected.owner,
          repoName: selected.name,
          defaultBranch: selected.defaultBranch,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? "Failed to create project");
        return;
      }

      onSelect(selected, json.data.id);
    } catch {
      setError("Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  /**
   * Navigate to /api/github/install with the current path as return_to.
   * The API sets a cookie, then redirects to GitHub's app install page.
   * After the user installs, GitHub redirects back to our callback,
   * which reads the cookie and sends the user right back here.
   */
  const handleConnectOrg = () => {
    const returnTo = encodeURIComponent(pathname);
    window.location.href = `/api/github/install?return_to=${returnTo}`;
  };

  return (
    <div className="flex flex-col items-center w-full max-w-xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Connect a repository
        </h2>
        <p className="text-sm text-muted-foreground">
          Select the repository you want Orbit to analyze and test.
        </p>
      </div>

      {/* Success banner after org install */}
      {justConnectedOrg && (
        <div className="w-full mb-4 flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 rounded-md px-3 py-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Connected <strong>{justConnectedOrg}</strong> — their repos are now available below.
        </div>
      )}

      <div className="flex gap-2 w-full mb-4">
        {(Object.keys(PROVIDER_CONFIG) as RepoProvider[]).map((p) => {
          const isSupported = p === "github";
          return (
            <button
              key={p}
              type="button"
              disabled={!isSupported}
              onClick={() => { setProvider(p); setSelectedId(null); }}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                provider === p
                  ? "bg-orbit-accent/20 text-orbit-accent"
                  : "bg-muted/30 text-muted-foreground hover:text-foreground",
                !isSupported && "opacity-40 cursor-not-allowed hover:text-muted-foreground"
              )}
            >
              <GitBranch className="h-3.5 w-3.5" />
              {PROVIDER_CONFIG[p].label}
              {!isSupported && (
                <span className="text-[10px] uppercase tracking-wider">Soon</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Organization connections */}
      {showOrgSection && (
        <div className="w-full mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Organizations
            </span>
            <button
              type="button"
              onClick={handleConnectOrg}
              className="text-xs text-orbit-accent hover:text-orbit-accent/80 flex items-center gap-1 transition-colors"
            >
              <Plus className="h-3 w-3" />
              Connect organization
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {installedOrgs.map((org) => (
              <span
                key={org.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-xs text-emerald-400"
              >
                {org.avatarUrl ? (
                  <img src={org.avatarUrl} alt="" className="h-3.5 w-3.5 rounded-full" />
                ) : (
                  <CheckCircle2 className="h-3 w-3" />
                )}
                {org.login}
              </span>
            ))}

            {uninstalledOrgs.map((org) => (
              <button
                key={org.id}
                type="button"
                onClick={handleConnectOrg}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/30 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                {org.avatarUrl ? (
                  <img src={org.avatarUrl} alt="" className="h-3.5 w-3.5 rounded-full opacity-50" />
                ) : (
                  <Building2 className="h-3 w-3" />
                )}
                {org.login}
                <Plus className="h-2.5 w-2.5" />
              </button>
            ))}

            {orgData?.orgs.length === 0 && (
              <button
                type="button"
                onClick={handleConnectOrg}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-muted-foreground/30 text-xs text-muted-foreground hover:text-foreground hover:border-orbit-accent/40 transition-colors"
              >
                <Building2 className="h-3.5 w-3.5" />
                Connect an organization
              </button>
            )}
          </div>
        </div>
      )}

      <div className="relative w-full mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search repositories..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9 bg-background"
        />
      </div>

      {error && (
        <div className="w-full mb-4 flex items-center gap-2 text-sm text-orbit-fail bg-orbit-fail/10 rounded-md px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <ScrollArea className="w-full h-[340px] rounded-lg surface-1">
        <div className="p-1">
          {loading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading repositories...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-sm text-muted-foreground">
              <span>No repositories match your search.</span>
              {showOrgSection && (
                <button
                  type="button"
                  onClick={handleConnectOrg}
                  className="text-orbit-accent hover:underline text-xs"
                >
                  Connect an organization to see more repos
                </button>
              )}
            </div>
          ) : (
            filtered.map((repo) => (
              <button
                key={repo.id}
                type="button"
                onClick={() => setSelectedId(repo.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 rounded-md text-left transition-colors",
                  "hover:bg-muted/30",
                  selectedId === repo.id && "bg-orbit-accent/10"
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-foreground truncate">
                      {repo.fullName}
                    </span>
                    {repo.isPrivate ? (
                      <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
                    ) : (
                      <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
                    )}
                    {repo.source === "installation" && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-orbit-accent/30 text-orbit-accent shrink-0">
                        App
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className={cn("h-2 w-2 rounded-full", LANGUAGE_COLORS[repo.language] ?? "bg-gray-400")} />
                      {repo.language}
                    </span>
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3" />
                      {repo.stars}
                    </span>
                    <span>Updated {formatUpdatedAt(repo.updatedAt)}</span>
                  </div>
                </div>
                {selectedId === repo.id && (
                  <Badge variant="outline" className="text-orbit-accent border-orbit-accent/40 shrink-0">
                    Selected
                  </Badge>
                )}
              </button>
            ))
          )}
        </div>
      </ScrollArea>

      <Button
        className="mt-6 bg-orbit-accent hover:bg-orbit-accent/90 text-white gap-2"
        size="lg"
        disabled={!selected || creating}
        onClick={handleContinue}
      >
        {creating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Creating project...
          </>
        ) : (
          <>
            Continue
            <ChevronRight className="h-4 w-4" />
          </>
        )}
      </Button>
    </div>
  );
}
