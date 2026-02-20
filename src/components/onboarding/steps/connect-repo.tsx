"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Search, Star, Lock, Globe, ChevronRight, Loader2, AlertCircle, GitBranch } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { RepoItem } from "../onboarding-types";

type RepoProvider = "github" | "gitlab" | "bitbucket";

const PROVIDER_CONFIG: Record<RepoProvider, { label: string; color: string }> = {
  github: { label: "GitHub", color: "bg-white/10" },
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
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [provider, setProvider] = useState<RepoProvider>("github");

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

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

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

      <div className="flex gap-2 w-full mb-4">
        {(Object.keys(PROVIDER_CONFIG) as RepoProvider[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => { setProvider(p); setSelectedId(null); }}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              provider === p
                ? "bg-orbit-accent/20 text-orbit-accent"
                : "bg-white/[0.04] text-muted-foreground hover:text-foreground"
            )}
          >
            <GitBranch className="h-3.5 w-3.5" />
            {PROVIDER_CONFIG[p].label}
          </button>
        ))}
      </div>

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
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              No repositories match your search.
            </div>
          ) : (
            filtered.map((repo) => (
              <button
                key={repo.id}
                type="button"
                onClick={() => setSelectedId(repo.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 rounded-md text-left transition-colors",
                  "hover:bg-white/[0.04]",
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
