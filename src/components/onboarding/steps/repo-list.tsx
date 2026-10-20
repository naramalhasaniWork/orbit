"use client";

import { Star, Lock, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RepoItem } from "../onboarding-types";

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "bg-tm-info",
  JavaScript: "bg-tm-warn",
  Go: "bg-tm-info",
  Python: "bg-tm-warn",
  Rust: "bg-tm-warn",
  Ruby: "bg-tm-fail",
  Java: "bg-tm-warn",
  Unknown: "bg-gray-400",
};

function formatUpdatedAt(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
}

interface RepoListProps {
  repos: RepoItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function RepoList({ repos, selectedId, onSelect }: RepoListProps) {
  return (
    <>
      {repos.map((repo) => (
        <button
          key={repo.id}
          type="button"
          onClick={() => onSelect(repo.id)}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-3 rounded-md text-left transition-colors",
            "hover:bg-muted/30",
            selectedId === repo.id && "bg-foreground/[0.06]"
          )}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-medium text-foreground truncate">{repo.fullName}</span>
              {repo.isPrivate ? (
                <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
              ) : (
                <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
              )}
              {repo.source === "installation" && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-tm-line-strong text-foreground shrink-0">
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
            <Badge variant="outline" className="text-foreground border-tm-line-strong shrink-0">
              Selected
            </Badge>
          )}
        </button>
      ))}
    </>
  );
}
