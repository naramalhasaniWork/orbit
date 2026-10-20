"use client";

import { Pending } from "@/components/telemetry/pending";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import {
  Search, ChevronRight, AlertCircle, GitBranch, CheckCircle2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { RepoItem } from "../onboarding-types";
import { RepoList } from "./repo-list";
import { OrgConnections, type OrgData } from "./org-connections";
import { GitHubReconnect } from "./github-reconnect";
import { PublicRepoInput } from "./public-repo-input";

type RepoProvider = "github" | "gitlab" | "bitbucket";

const PROVIDER_CONFIG: Record<RepoProvider, { label: string; color: string }> = {
  github: { label: "GitHub", color: "bg-muted/60" },
  gitlab: { label: "GitLab", color: "bg-tm-warn/10" },
  bitbucket: { label: "Bitbucket", color: "bg-tm-info/10" },
};

interface ConnectRepoProps {
  onSelect: (repo: RepoItem, projectId: string) => void;
}

export function ConnectRepo({ onSelect }: ConnectRepoProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [publicRepo, setPublicRepo] = useState<RepoItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [provider, setProvider] = useState<RepoProvider>("github");
  const [orgData, setOrgData] = useState<OrgData | null>(null);
  const [justConnectedOrg, setJustConnectedOrg] = useState<string | null>(null);

  const fetchRepos = useCallback(async () => {
    setLoading(true);
    setError(null);
    setErrorCode(null);
    try {
      const res = await fetch(`/api/user/repos?per_page=50&provider=${provider}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setRepos([]);
        setErrorCode(json.error?.code ?? null);
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
      // Sync any installations made outside Orbit's callback flow
      await fetch("/api/github/installations", { method: "POST" }).catch(() => {});

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

  // A pasted public repo is listed first, alongside whatever GitHub returned.
  const allRepos = useMemo(
    () => (publicRepo ? [publicRepo, ...repos.filter((r) => r.id !== publicRepo.id)] : repos),
    [publicRepo, repos]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return allRepos;
    const lower = query.toLowerCase();
    return allRepos.filter(
      (r) =>
        r.name.toLowerCase().includes(lower) ||
        r.fullName.toLowerCase().includes(lower) ||
        r.language.toLowerCase().includes(lower)
    );
  }, [query, allRepos]);

  const selected = allRepos.find((r) => r.id === selectedId);

  const needsReconnect = errorCode === "NO_GITHUB_TOKEN";
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
        <h2 className="text-xl font-medium text-foreground mb-2">
          Connect a repository
        </h2>
        <p className="text-sm text-muted-foreground">
          Select the repository you want Orbit to analyze and test.
        </p>
      </div>

      {/* Success banner after org install */}
      {justConnectedOrg && (
        <div className="w-full mb-4 flex items-center gap-2 text-sm text-tm-pass bg-tm-pass/10 rounded-md px-3 py-2">
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
                  ? "bg-foreground/[0.06] text-foreground"
                  : "bg-muted/30 text-muted-foreground hover:text-foreground",
                !isSupported && "opacity-40 cursor-not-allowed hover:text-muted-foreground"
              )}
            >
              <GitBranch className="h-3.5 w-3.5" />
              {PROVIDER_CONFIG[p].label}
              {!isSupported && (
                <span className=" tm-label">Soon</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Organization connections */}
      {showOrgSection && !needsReconnect && orgData && (
        <OrgConnections orgs={orgData.orgs} onConnect={handleConnectOrg} />
      )}

      {/* One state for "GitHub can't list repos": reconnect, or the error with a retry */}
      {needsReconnect && <GitHubReconnect />}
      {error && !needsReconnect && (
        <div role="alert" className="w-full mb-4 flex items-center gap-2 text-sm text-orbit-fail bg-orbit-fail/10 rounded-md px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          {allRepos.length === 0 && (
            <button type="button" onClick={fetchRepos} className="text-xs underline underline-offset-2 shrink-0">
              Try again
            </button>
          )}
        </div>
      )}

      <PublicRepoInput
        onResolved={(repo) => {
          setPublicRepo(repo);
          setSelectedId(repo.id);
          setQuery("");
        }}
      />

      {(allRepos.length > 0 || loading || (!error && !needsReconnect)) && (
        <>
          <div className="relative w-full mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search repositories..."
              aria-label="Search repositories"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 bg-background"
            />
          </div>

          <ScrollArea className="w-full h-[340px] rounded-lg surface-1">
            <div className="p-1">
              {loading && allRepos.length === 0 ? (
                <div className="flex items-center justify-center h-32 gap-2 text-sm text-muted-foreground">
                  <Pending />
                  Loading repositories...
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2 text-sm text-muted-foreground">
                  <span>
                    {query.trim() ? "No repositories match your search." : "No repositories found for this account."}
                  </span>
                  {showOrgSection && (
                    <button
                      type="button"
                      onClick={handleConnectOrg}
                      className="text-foreground hover:underline text-xs"
                    >
                      Connect an organization to see more repos
                    </button>
                  )}
                </div>
              ) : (
                <RepoList repos={filtered} selectedId={selectedId} onSelect={setSelectedId} />
              )}
            </div>
          </ScrollArea>
        </>
      )}

      <Button
        className="mt-6 bg-primary hover:bg-primary/85 text-primary-foreground gap-2"
        size="lg"
        disabled={!selected || creating}
        onClick={handleContinue}
      >
        {creating ? (
          <>
            <Pending />
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
